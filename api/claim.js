// api/claim.js
const fetch = require('node-fetch');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { action, wallet } = req.body;

    try {
        // --- ACTION: CLAIM (FaucetPay Payout) ---
        if (action === 'claim') {
            if (!wallet) {
                return res.status(400).json({ success: false, message: 'Wallet address is required' });
            }

            const API_KEY = process.env.FAUCETPAY_API_KEY;
            if (!API_KEY) {
                console.error('FAUCETPAY_API_KEY is missing in Vercel Env');
                return res.status(500).json({ success: false, message: 'Server config error (API Key missing)' });
            }

            const AMOUNT = 210; // сатоши (0.00000021)
            const CURRENCY = 'USDT';

            // Отправка запроса в FaucetPay
            const fpRes = await fetch('https://faucetpay.io/api/v1/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `api_key=${API_KEY}&amount=${AMOUNT}&to=${wallet}&currency=${CURRENCY}`
            });
            
            const fpData = await fpRes.json();

            if (fpData.status === 200) {
                return res.json({ success: true, message: 'Payment sent to FaucetPay!', payout_id: fpData.payout_id });
            } else {
                // Возвращаем ошибку от FaucetPay (например, недостаточно средств или неверный кошелек)
                return res.status(400).json({ success: false, message: fpData.message || 'FaucetPay rejected the request' });
            }
        }
        
        // Если пришел неизвестный action
        return res.status(400).json({ success: false, message: 'Invalid action' });

    } catch (e) {
        console.error('Critical Server Error:', e);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
