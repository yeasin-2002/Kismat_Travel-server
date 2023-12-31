import { ENV } from "@config";
import { db } from "@db";
import { HttpException } from "@exceptions/http.exception";
import { ensureFilePathExists } from "@utils/file";
import { joinUrl } from "@utils/joinUrl";
import axios from "axios";
import { isObject } from "class-validator";
import * as fs from "fs";
import { join } from "path";

const HEADER_STORE = join(__dirname, "../../credentials");
const HEADER_FILE = join(HEADER_STORE, "auth.json");

export async function getFlyHubAuth() {
  const dbRes = await db.Credentials.findOne({ where: { key: "@api-key" } });
  if (!dbRes) throw new HttpException(404, "Credentials not found");

  try {
    const { data } = await axios.post<{ ExpireTime: string; TokenId: string }>(
      joinUrl(ENV.FLY_HUB_API_BASE_URL, "Authenticate"),
      { username: dbRes.username, apikey: dbRes.apikey },
      { headers: { "Content-Type": "application/json" } },
    );

    return data;
  } catch {
    throw new HttpException(500, "Authentication error fly-hub");
  }
}

function createExpireDate(expirationDays: string) {
  return new Date(expirationDays).toISOString();
}

export function saveDataWithExpiration(token: string, expirationDays: string) {
  ensureFilePathExists(HEADER_STORE);
  fs.writeFileSync(HEADER_FILE, JSON.stringify({ token, expire: createExpireDate(expirationDays) }, null, 2));
  return token;
}

export function checkExpirationAndRetrieveToken() {
  try {
    ensureFilePathExists(HEADER_STORE);
    const data = JSON.parse(fs.readFileSync(HEADER_FILE, "utf8"));
    const expirationDate = new Date(data.expire);

    return { auth: data.token as string, valid: (expirationDate > new Date()) as true } as const;
  } catch {
    return { auth: null as null, valid: false } as const;
  }
}

export async function getAuthorizeHeader(): Promise<string> {
  const prev = checkExpirationAndRetrieveToken();

  if (prev.valid) {
    return prev.auth;
  }

  const authInfo = await getFlyHubAuth();

  if (isObject(authInfo) && typeof authInfo.TokenId !== "string") throw new HttpException(500, "Token generation failed");
  return saveDataWithExpiration(authInfo.TokenId, authInfo.ExpireTime);
}
