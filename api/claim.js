// api/claim.js
const fetch = require('node-fetch');
const { Redis } = require('@upstash/redis');

// Подключение к Redis (переменные из Vercel)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REST_TOKEN,
});

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { action, wallet, username, password, ref } = req.body;

    try {
        // --- ACTION: REGISTER ---
        if (action === 'register') {
            if (!username || !password || !wallet) {
                return res.status(400).json({ success: false, message: 'Fill all fields' });
            }
            
            const exists = await redis.exists(`user:${username}`);
            if (exists) {
                return res.status(400).json({ success: false, message: 'Username already taken' });
            }

            // Сохраняем пользователя
            await redis.hset(`user:${username}`, { 
                wallet: wallet, 
                password: password, // В реальном проекте пароли нужно хешировать!
                balance: 0, 
                referrals: 0, 
                refEarnings: 0,
                claimed: 0
            });

            // Если регистрация по реф. ссылке
            if (ref) {
                const refExists = await redis.exists(`user:${ref}`);
                if (refExists) {
                    await redis.hincrby(`user:${ref}`, 'referrals', 1);
                }
            }

            return res.json({ success: true, message: 'Registered! Please login.' });
        }

        // --- ACTION: LOGIN ---
        if (action === 'login') {
            if (!username || !password) {
                return res.status(400).json({ success: false, message: 'Missing fields' });
            }

            const user = await redis.hgetall(`user:${username}`);
            if (!user || user.password !== password) {
                return res.status(401).json({ success: false, message: 'Invalid credentials' });
            }

            return res.json({ 
                success: true, 
                data: { 
                    username, 
                    wallet: user.wallet, 
                    balance: parseFloat(user.balance || 0).toFixed(8),
                    referrals: user.referrals || 0,
                    refEarnings: parseFloat(user.refEarnings || 0).toFixed(8)
                } 
            });
        }

        // --- ACTION: CLAIM (FaucetPay Payout) ---
        if (action === 'claim') {
            const { username } = req.body;
            if (!username) return res.status(401).json({ success: false, message: 'Login required' });

            // Проверка кулдауна (например, 5 минут)
            const lastClaim = await redis.get(`cooldown:${username}`);
            const now = Date.now();
            if (lastClaim && (now - lastClaim < 300000)) {
                 return res.status(400).json({ success: false, message: 'Wait 5 minutes between claims' });
            }

            const user = await redis.hgetall(`user:${username}`);
            const API_KEY = process.env.FAUCETPAY_API_KEY;
            const AMOUNT = 210; // сатоши
            const CURRENCY = 'USDT';

            // Отправка в FaucetPay
            const fpRes = await fetch('https://faucetpay.io/api/v1/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `api_key=${API_KEY}&amount=${AMOUNT}&to=${user.wallet}&currency=${CURRENCY}`
            });
            const fpData = await fpRes.json();

            if (fpData.status === 200) {
                await redis.hincrby(`user:${username}`, 'balance', AMOUNT); // Добавляем в локальный баланс
                await redis.set(`cooldown:${username}`, now); // Ставим кулдаун
                return res.json({ success: true, message: 'Payment sent!', amount: AMOUNT });
            } else {
                return res.status(400).json({ success: false, message: fpData.message || 'FaucetPay error' });
            }
        }

    } catch (e) {
        console.error(e);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
