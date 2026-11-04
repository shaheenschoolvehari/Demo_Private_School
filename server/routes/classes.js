const router = require('express').Router();
const pool = require('../db');

// ==========================================
// CLASSES API
// ==========================================

// List Classes
router.get('/', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM classes ORDER BY class_name");
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server Error: " + err.message });
    }
});

// List Classes (alternate endpoint for clarity)
router.get('/classes', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM classes ORDER BY class_name");
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server Error: " + err.message });
    }
});

// Create Class
router.post('/', async (req, res) => {
    try {
        const { class_name, description } = req.body;
        const newClass = await pool.query(
            "INSERT INTO classes (class_name, description) VALUES ($1, $2) RETURNING *",
            [class_name, description]
        );
        res.json(newClass.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server Error: " + err.message });
    }
});

// ==========================================
// PRIORITY SETTING API (Must be before /:id)
// ==========================================

// GET /academic/priority — returns classes with sections, ordered by priority
router.get('/priority', async (req, res) => {
    try {
        const classesResult = await pool.query(`
            SELECT class_id, class_name, description, COALESCE(class_order, class_id) AS class_order
            FROM classes
            ORDER BY COALESCE(class_order, 9999), class_id ASC
        `);

        const sectionsResult = await pool.query(`
            SELECT section_id, section_name, class_id, COALESCE(section_order, section_id) AS section_order
            FROM sections
            ORDER BY class_id, COALESCE(section_order, 9999), section_id ASC
        `);

        // Group sections by class_id
        const sectionsByClass = {};
        for (const sec of sectionsResult.rows) {
            if (!sectionsByClass[sec.class_id]) sectionsByClass[sec.class_id] = [];
            sectionsByClass[sec.class_id].push(sec);
        }

        const classes = classesResult.rows.map(cls => ({
            ...cls,
            sections: sectionsByClass[cls.class_id] || []
        }));

        res.json(classes);
    } catch (err) {
        console.error('Priority GET error:', err.message);
        res.status(500).json({ error: "Server Error: " + err.message });
    }
});

// PUT /academic/priority — batch-update class_order and section_order
router.put('/priority', async (req, res) => {
    const client = await pool.connect();
    try {
        const { classes } = req.body;
        if (!Array.isArray(classes)) {
            return res.status(400).json({ error: "classes array is required" });
        }

        await client.query('BEGIN');

        for (const cls of classes) {
            if (cls.class_id == null || cls.class_order == null) continue;
            await client.query(
                'UPDATE classes SET class_order = $1 WHERE class_id = $2',
                [cls.class_order, cls.class_id]
            );

            if (Array.isArray(cls.sections)) {
                for (const sec of cls.sections) {
                    if (sec.section_id == null || sec.section_order == null) continue;
                    await client.query(
                        'UPDATE sections SET section_order = $1 WHERE section_id = $2',
                        [sec.section_order, sec.section_id]
                    );
                }
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, message: "Priority saved successfully" });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Priority PUT error:', err.message);
        res.status(500).json({ error: "Server Error: " + err.message });
    } finally {
        client.release();
    }
});

// Update Class
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (isNaN(Number(id))) {
            return res.status(400).json({ error: "Invalid class id" });
        }
        const { class_name, description } = req.body;
        await pool.query(
            "UPDATE classes SET class_name = $1, description = $2 WHERE class_id = $3",
            [class_name, description, id]
        );
        res.json("Class updated");
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server Error: " + err.message });
    }
});

// Delete Class
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (isNaN(Number(id))) {
            return res.status(400).json({ error: "Invalid class id" });
        }
        await pool.query("DELETE FROM classes WHERE class_id = $1", [id]);
        res.json("Class deleted");
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server Error: " + err.message });
    }
});


// ==========================================
// SECTIONS API
// ==========================================

// List Sections
router.get('/sections', async (req, res) => {
    try {
        const query = `
            SELECT s.*, c.class_name 
            FROM sections s
            JOIN classes c ON s.class_id = c.class_id
            ORDER BY c.class_name, s.section_name
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// Create Section
router.post('/sections', async (req, res) => {
    try {
        const { section_name, class_id } = req.body;
        const newSection = await pool.query(
            "INSERT INTO sections (section_name, class_id) VALUES ($1, $2) RETURNING *",
            [section_name, class_id]
        );
        res.json(newSection.rows[0]);
    } catch (err) {
        if (err.code === '23505') { // Unique violation
            return res.status(400).json({ error: "Section already exists for this class" });
        }
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// Update Section
router.put('/sections/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { section_name, class_id } = req.body;
        await pool.query(
            "UPDATE sections SET section_name = $1, class_id = $2 WHERE section_id = $3",
            [section_name, class_id, id]
        );
        res.json("Section updated");
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// Delete Section
router.delete('/sections/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("DELETE FROM sections WHERE section_id = $1", [id]);
        res.json("Section deleted");
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
