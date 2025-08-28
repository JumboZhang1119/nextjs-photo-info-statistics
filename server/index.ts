import express, { Request, Response } from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import https from 'https';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Create an HTTPS agent that ignores self-signed certificate errors
const agent = new https.Agent({
    rejectUnauthorized: false
});

// Synology Login Endpoint
app.post('/api/synology-login', async (req: Request, res: Response) => {
    const { host, account, password } = req.body;
    try {
        const loginUrl = `${host}/photo/webapi/auth.cgi?api=SYNO.PhotoStation.Auth&method=login&version=1&account=${account}&passwd=${password}&format=sid`;
        // Use the custom HTTPS agent
        const response = await fetch(loginUrl, { agent });
        const data: any = await response.json();
        // Handle the response based on success or failure
        if (data.success) {
            res.status(200).json({ success: true, sid: data.data.sid });
        } else {
            if (data.error && data.error.code === 400) {
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

// Synology Logout Endpoint
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

app.post('/api/synology', async (req: Request, res: Response) => {
});

// Start the server
app.listen(port, () => {
    console.log(`後端伺服器已啟動，正在監聽 http://localhost:${port}`);
});