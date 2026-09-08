require('dotenv').config({ path: 'server/.env' });
const pool = require('./server/db');

(async () => {
    const res = await pool.query(`
        SELECT mfs.slip_id, mfs.student_id, mfs.family_id, s.first_name, s.last_name, s.status, mfs.month, mfs.year, mfs.total_amount, mfs.paid_amount, mfs.status as slip_status
        FROM monthly_fee_slips mfs
        JOIN students s ON mfs.student_id = s.student_id
        WHERE mfs.family_id = 'FAM-2026-0006'
        ORDER BY mfs.month ASC
    `);
    console.table(res.rows);
    process.exit(0);
})();
