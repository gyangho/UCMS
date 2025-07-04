const express = require('express');
const router = express.Router();


// 사용자 정보 API
router.get('/user', (req, res) => {
    if (req.session.user) {
        res.json(req.session.user);
    } else {
        res.status(401).json({ error: 'Not logged in' });
    }
});

router.get('/records', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM purchases ORDER BY purchase_time DESC');

        // 상품별 총합 계산
        const summary = {
            버터쿠키: 0,
            플레인휘낭시에: 0,
            고구마식빵휘낭: 0,
            고구마휘낭시에: 0,
            흑임자휘낭시에: 0,
            행운과자: 0,
            행운과자증정: 0,
            total_price: 0
        };

        rows.forEach(row => {
            Object.keys(summary).forEach(key => {
                summary[key] += row[key] || 0;
            });
        });

        res.json({ records: rows, summary });
    } catch (err) {
        console.error('Error fetching records:', err);
        res.status(500).json({ error: '기록 조회 실패' });
    }
});


router.post('/purchase', async (req, res) => {
    const cart = req.body.cart;
    const total = req.body.total;

    // 상품명 -> 컬럼명 매핑
    const fields = {
        '버터쿠키': 0,
        '플레인휘낭시에': 0,
        '고구마식빵휘낭': 0,
        '고구마휘낭시에': 0,
        '흑임자휘낭시에': 0,
        '행운과자': 0,
        '행운과자(증정)': 0
    };

    // 장바구니에서 수량 반영
    for (const [name, item] of Object.entries(cart)) {
        const cleanName = name.replace(/\s+/g, '').replace(/[()]/g, '');
        if (fields.hasOwnProperty(name)) {
            fields[cleanName] = item.qty;
        }
    }

    try {
        const query = `
        INSERT INTO purchases 
        (${Object.keys(fields).map(name => name.replace(/\s+/g, '').replace(/[()]/g, '')).join(', ')}, total_price) 
        VALUES (${Object.values(fields).map(() => '?').join(', ')}, ?)
      `;

        const values = [...Object.values(fields), total];

        await db.query(query, values);
        res.json({ message: '구매 완료' });
    } catch (err) {
        console.error('DB Insert Error:', err);
        res.status(500).json({ error: 'DB 저장 실패' });
    }
});

router.post('/records/clear', async (req, res) => {
    try {
        await db.query('TRUNCATE TABLE purchases;');
        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '초기화 실패' });
    }
});

router.delete('/records/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM purchases WHERE id = ?', [id]);
        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '삭제 실패' });
    }
});

module.exports = router;