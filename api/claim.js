// api/claim.js
const fetch = require('node-fetch');

module.exports = async (req, res) => {
    // Разрешаем запросы с твоего сайта
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { wallet, referral } = req.body;

    // 1. Проверка формата кошелька (простая)
    if (!wallet || wallet.length < 10) {
        return res.status(400).json({ success: false, message: 'Invalid wallet address.' });
    }

    // 2. Проверка API ключа
    const API_KEY = process.env.FAUCETPAY_API_KEY;
    if (!API_KEY) {
        return res.status(500).json({ success: false, message: 'Server configuration error.' });
    }

    // 3. Данные для отправки
    const AMOUNT = 210; // В сатоши (0.00000021 BTC = 210 сатоши)
    const CURRENCY = 'USDT'; // Или BTC, TRX, LTC - смотри документацию FaucetPay
    
    // ПРИМЕЧАНИЕ: FaucetPay USDT работает в сети TRC20 (обычно).
    // Убедись, что пользователь вводит TRC20 адрес, если выбран USDT.

    try {
        // 4. Запрос к FaucetPay API
        const fpResponse = await fetch('https://faucetpay.io/api/v1/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `api_key=${API_KEY}&amount=${AMOUNT}&to=${wallet}&currency=${CURRENCY}&referral=${referral || ''}`
        });

        const data = await fpResponse.json();

        if (data.status === 200) {
            // Успешная выплата
            return res.status(200).json({ 
                success: true, 
                message: `Payment sent! ID: ${data.payout_id}`,
                balance: data.balance 
            });
        } else {
            // Ошибка FaucetPay (например, недостаточно средств или неверный кошелек)
            return res.status(400).json({ 
                success: false, 
                message: data.message || 'FaucetPay error.' 
            });
        }

    } catch (error) {
        console.error('Server Error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};
