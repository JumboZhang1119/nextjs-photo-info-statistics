// api/synology.ts

import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';

// --- 定義我們期望的 API 回應類型 ---
interface SynologyAuthResponse {
  success: boolean;
  data: {
    sid: string;
  };
  error?: {
    code: number;
  }
}

interface SynologyItem {
  id: number;
  filename: string;
  additional?: {
    exif?: Record<string, any>; // EXIF 的內容比較複雜，先用 Record<string, any>
  };
}

interface SynologyItemResponse {
  success: boolean;
  data: {
    list: SynologyItem[];
  };
}
// ------------------------------------

const AUTH_API_PATH = '/webapi/auth.cgi';
const ITEM_API_PATH = '/webapi/entry.cgi';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { host, account, password, albumId } = req.body;

  if (!host || !account || !password || !albumId) {
    return res.status(400).json({ message: 'Missing required parameters' });
  }

  let sid = '';

  try {
    const authUrl = `${host}${AUTH_API_PATH}?api=SYNO.API.Auth&version=7&method=login&account=${encodeURIComponent(account)}&passwd=${encodeURIComponent(password)}&session=FileStation&format=sid`;
    const authResponse = await fetch(authUrl);
    // 告訴 TypeScript 我們預期 authData 是 SynologyAuthResponse 類型
    const authData = (await authResponse.json()) as SynologyAuthResponse;

    if (!authData.success || !authData.data.sid) {
      console.error('Synology login error:', authData.error);
      throw new Error('Synology 登入失敗，請檢查主機位址與帳號密碼。');
    }
    sid = authData.data.sid;

    const itemUrl = `${host}${ITEM_API_PATH}?api=SYNO.Foto.Browse.Item&version=1&method=list&album_id=${albumId}&limit=100&additional=["exif"]&_sid=${sid}`;
    const itemResponse = await fetch(itemUrl);
    // 告訴 TypeScript 我們預期 itemData 是 SynologyItemResponse 類型
    const itemData = (await itemResponse.json()) as SynologyItemResponse;

    if (!itemData.success) {
      throw new Error('無法獲取相簿內容。');
    }
    
    const logoutUrl = `${host}${AUTH_API_PATH}?api=SYNO.API.Auth&version=1&method=logout&session=FileStation&_sid=${sid}`;
    await fetch(logoutUrl);

    res.status(200).json(itemData.data.list);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('API Error:', errorMessage);
    
    if (sid) {
        const logoutUrl = `${host}${AUTH_API_PATH}?api=SYNO.API.Auth&version=1&method=logout&session=FileStation&_sid=${sid}`;
        await fetch(logoutUrl);
    }

    res.status(500).json({ message: errorMessage });
  }
}