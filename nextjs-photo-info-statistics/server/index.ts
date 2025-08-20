import express, { Request, Response } from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import https from 'https';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// 讓 Node.js 接受自簽名憑證
const agent = new https.Agent({
    rejectUnauthorized: false
});

// 新增一個登入路由，專門用於取得 Session ID
app.post('/api/synology-login', async (req: Request, res: Response) => {
    const { host, account, password } = req.body;
    try {
        const loginUrl = `${host}/photo/webapi/auth.cgi?api=SYNO.PhotoStation.Auth&method=login&version=1&account=${account}&passwd=${password}&format=sid`;
        
        const response = await fetch(loginUrl, { agent });
        const data: any = await response.json();

        if (data.success) {
            // 成功取得 Session ID，回傳給前端
            res.status(200).json({ success: true, sid: data.data.sid });
        } else {
            // 處理登入失敗，包括二階段驗證
            if (data.error && data.error.code === 400) {
                // Synology API 的錯誤碼 400 通常代表需要 2FA
                res.status(401).json({ success: false, message: '需要二階段驗證碼。' });
            } else {
                res.status(401).json({ success: false, message: data.error?.message || '登入失敗。' });
            }
        }
    } catch (error) {
        console.error('登入失敗:', error);
        res.status(500).json({ success: false, message: '伺服器內部錯誤，請檢查NAS位址。' });
    }
});

// 新增一個路由來處理登出
app.post('/api/synology-logout', async (req: Request, res: Response) => {
    const { host, sid } = req.body;
    try {
        const logoutUrl = `${host}/photo/webapi/auth.cgi?api=SYNO.PhotoStation.Auth&method=logout&version=1&sid=${sid}`;
        await fetch(logoutUrl, { agent });
        res.status(200).json({ success: true, message: '登出成功。' });
    } catch (error) {
        console.error('登出失敗:', error);
        res.status(500).json({ success: false, message: '登出時發生錯誤。' });
    }
});

// 原本的程式碼，現在主要處理相簿資料
app.post('/api/synology', async (req: Request, res: Response) => {
    // 為了避免混亂，我們可以先保留，但知道它將被替換掉
    // ...
});

app.listen(port, () => {
    console.log(`後端伺服器已啟動，正在監聽 http://localhost:${port}`);
});