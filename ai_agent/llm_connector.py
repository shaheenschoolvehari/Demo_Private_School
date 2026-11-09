import httpx
from typing import Optional, List, Dict, Any
from .db import get_db_cursor

def get_db_llm_config() -> Dict[str, str]:
    """Retrieves active LLM configuration from PostgreSQL system_settings table."""
    config = {
        "llm_provider": "gemini",
        "llm_model": "gemini-2.0-flash",
        "llm_temperature": "0.3",
        "llm_base_url": "",
        "llm_is_enabled": "false",
        "llm_api_key": ""
    }
    try:
        with get_db_cursor() as cur:
            cur.execute("""
                SELECT setting_key, setting_value 
                FROM system_settings 
                WHERE setting_key IN ('llm_provider', 'llm_api_key', 'llm_model', 'llm_temperature', 'llm_base_url', 'llm_is_enabled');
            """)
            for row in cur.fetchall():
                k, v = row
                if v:
                    config[k] = v.strip()
    except Exception as e:
        print(f"[LLM CONFIG FETCH ERROR]: {e}")
    return config


def generate_chat_completion(
    system_prompt: str,
    user_message: str,
    conversation_history: Optional[List[Dict[str, str]]] = None
) -> Optional[str]:
    """
    Executes a dynamic completion using the provider and model chosen in system_settings.
    Supports Google Gemini, OpenAI, Claude, OpenRouter, Grok, Kimi, Groq, Custom.
    """
    config = get_db_llm_config()
    is_enabled = config.get("llm_is_enabled") == "true"
    api_key = config.get("llm_api_key", "").strip()

    if not is_enabled or not api_key:
        return None

    provider = config.get("llm_provider", "gemini").lower()
    model = config.get("llm_model") or "gemini-2.0-flash"
    temp = float(config.get("llm_temperature") or 0.3)
    history = conversation_history or []

    try:
        # 1. Google Gemini Native
        if provider == "gemini":
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            contents = []
            for h in history[-4:]:
                role = "user" if h.get("sender") == "user" else "model"
                contents.append({"role": role, "parts": [{"text": h.get("text", "")}]})
            contents.append({"role": "user", "parts": [{"text": user_message}]})

            payload = {
                "contents": contents,
                "systemInstruction": {"parts": [{"text": system_prompt}]},
                "generationConfig": {"temperature": temp, "maxOutputTokens": 1024}
            }
            with httpx.Client(timeout=20.0) as client:
                res = client.post(url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            return parts[0].get("text")

        # 2. Anthropic Claude
        elif provider == "claude":
            url = "https://api.anthropic.com/v1/messages"
            messages = []
            for h in history[-4:]:
                role = "user" if h.get("sender") == "user" else "assistant"
                messages.append({"role": role, "content": h.get("text", "")})
            messages.append({"role": "user", "content": user_message})

            headers = {
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json"
            }
            payload = {
                "model": model,
                "max_tokens": 1024,
                "temperature": temp,
                "system": system_prompt,
                "messages": messages
            }
            with httpx.Client(timeout=20.0) as client:
                res = client.post(url, headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    content = data.get("content", [])
                    if content:
                        return content[0].get("text")

        # 3. OpenAI, OpenRouter, Grok, Kimi, Groq, Custom
        else:
            base_url = config.get("llm_base_url")
            if not base_url:
                if provider == "openai": base_url = "https://api.openai.com/v1"
                elif provider == "openrouter": base_url = "https://openrouter.ai/api/v1"
                elif provider == "grok": base_url = "https://api.x.ai/v1"
                elif provider == "kimi": base_url = "https://api.moonshot.cn/v1"
                elif provider == "groq": base_url = "https://api.groq.com/openai/v1"
                else: base_url = "https://api.openai.com/v1"

            url = f"{base_url.rstrip('/')}/chat/completions"
            messages = [{"role": "system", "content": system_prompt}]
            for h in history[-4:]:
                role = "user" if h.get("sender") == "user" else "assistant"
                messages.append({"role": role, "content": h.get("text", "")})
            messages.append({"role": "user", "content": user_message})

            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            if provider == "openrouter":
                headers["HTTP-Referer"] = "https://shaheenschool.edu"
                headers["X-Title"] = "SMS Role-Aware AI Agent"

            payload = {
                "model": model,
                "messages": messages,
                "temperature": temp,
                "max_tokens": 1024
            }
            with httpx.Client(timeout=25.0) as client:
                res = client.post(url, headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    choices = data.get("choices", [])
                    if choices:
                        return choices[0].get("message", {}).get("content")

    except Exception as e:
        print(f"[DYNAMIC LLM CALL FAILED]: {e}")

    return None
