'use client';

import React from 'react';

interface IsaacBotVectorProps {
    size?: number;
    showGlim?: boolean;
    className?: string;
}

/**
 * IsaacBotVector
 * Custom SVG vector recreation of Isaac AI avatar:
 * - Cute gradient red rounded body
 * - Two top antennae
 * - Side nubs/arms & bottom feet
 * - Dark oval eye sockets with vibrant glowing cyan/turquoise pupils
 * - Two angled white specular reflection capsules (glims) on upper-right
 */
export default function IsaacBotVector({ size = 52, showGlim = true, className = '' }: IsaacBotVectorProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 120 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`isaac-bot-vector ${className}`}
            style={{ display: 'inline-block', verticalAlign: 'middle' }}
        >
            <defs>
                {/* Body Radial Gradient */}
                <radialGradient id="isaacBodyGrad" cx="35%" cy="30%" r="72%">
                    <stop offset="0%" stopColor="#ff5252" />
                    <stop offset="42%" stopColor="#e53935" />
                    <stop offset="80%" stopColor="#c62828" />
                    <stop offset="100%" stopColor="#8e0000" />
                </radialGradient>

                {/* Hand/Ear Radial Gradient */}
                <radialGradient id="isaacHandGrad" cx="35%" cy="30%" r="65%">
                    <stop offset="0%" stopColor="#ff6b6b" />
                    <stop offset="70%" stopColor="#d32f2f" />
                    <stop offset="100%" stopColor="#9a0007" />
                </radialGradient>

                {/* Cyan Eye Pupil Glow */}
                <radialGradient id="isaacPupilGrad" cx="45%" cy="45%" r="55%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="25%" stopColor="#80f7ff" />
                    <stop offset="65%" stopColor="#00e5ff" />
                    <stop offset="100%" stopColor="#0091ea" />
                </radialGradient>

                {/* Gloss / Glim Specular Reflection */}
                <linearGradient id="isaacGlimGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                    <stop offset="65%" stopColor="#ffffff" stopOpacity="0.7" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0.15" />
                </linearGradient>

                {/* Drop shadow */}
                <filter id="isaacGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="3.5" stdDeviation="3.5" floodColor="#8e0000" floodOpacity="0.4" />
                </filter>
            </defs>

            <g filter="url(#isaacGlow)">
                {/* 1. Curved Antennas */}
                <path
                    d="M 45 34 C 40 23, 33 22, 35 19 C 37 17, 47 19, 50 31"
                    stroke="#ff5252"
                    strokeWidth="4"
                    strokeLinecap="round"
                    fill="none"
                />
                <path
                    d="M 75 34 C 80 23, 87 22, 85 19 C 83 17, 73 19, 70 31"
                    stroke="#ff5252"
                    strokeWidth="4"
                    strokeLinecap="round"
                    fill="none"
                />

                {/* 2. Side Arms / Nubs */}
                <ellipse cx="20" cy="59" rx="10" ry="8" fill="url(#isaacHandGrad)" transform="rotate(-15 20 59)" />
                <ellipse cx="100" cy="59" rx="10" ry="8" fill="url(#isaacHandGrad)" transform="rotate(15 100 59)" />

                {/* 3. Bottom Feet */}
                <rect x="46" y="86" width="10" height="13" rx="4" fill="#a71919" />
                <rect x="64" y="86" width="10" height="13" rx="4" fill="#a71919" />

                {/* 4. Main Round Body */}
                <circle cx="60" cy="58" r="37" fill="url(#isaacBodyGrad)" />

                {/* 5. Glossy Glims (Specular highlights from image 2) */}
                {showGlim && (
                    <g className="isaac-glim-marks">
                        {/* Primary upper highlight pill */}
                        <rect
                            x="64"
                            y="25"
                            width="8.5"
                            height="18"
                            rx="4.25"
                            fill="url(#isaacGlimGrad)"
                            transform="rotate(-42 68 34)"
                        />
                        {/* Secondary highlight pill */}
                        <rect
                            x="80"
                            y="33"
                            width="6"
                            height="11"
                            rx="3"
                            fill="url(#isaacGlimGrad)"
                            transform="rotate(-42 83 38)"
                        />
                    </g>
                )}

                {/* 6. Dark Oval Eye Sockets */}
                <ellipse cx="48" cy="54" rx="7" ry="8.5" fill="#0d1b2a" />
                <ellipse cx="72" cy="54" rx="7" ry="8.5" fill="#0d1b2a" />

                {/* 7. Vibrant Glowing Cyan Pupils */}
                <circle cx="48" cy="54" r="3.8" fill="url(#isaacPupilGrad)" />
                <circle cx="72" cy="54" r="3.8" fill="url(#isaacPupilGrad)" />

                {/* 8. Specular glim dot in pupils */}
                <circle cx="49.5" cy="52.6" r="1.2" fill="#ffffff" />
                <circle cx="73.5" cy="52.6" r="1.2" fill="#ffffff" />
            </g>
        </svg>
    );
}
