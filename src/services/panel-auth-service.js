import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const defaultTotpWindow = 1;
const totpStepSeconds = 30;
const passwordHashBytes = 64;
const passwordSaltBytes = 16;
const scryptKeyLength = 64;
const totpSecretBytes = 20;
const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function normalizeString(value) {
  return String(value || "").trim();
}

function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = normalizeString(input)
    .toUpperCase()
    .replace(/[\s=-]/g, "");
  const bytes = [];
  let bits = 0;
  let value = 0;

  for (const char of normalized) {
    const index = alphabet.indexOf(char);

    if (index === -1) {
      throw new Error("Invalid base32 character");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function hotp(secret, counter) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, "0");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeUsername(value) {
  return normalizeString(value).replace(/\s+/g, "");
}

function normalizePassword(value) {
  return String(value || "");
}

function normalizeTotpSecret(value) {
  return normalizeString(value).toUpperCase().replace(/[\s=-]/g, "");
}

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += base32Alphabet[(value << (5 - bits)) & 31];
  }

  return output.match(/.{1,4}/g)?.join(" ") || output;
}

function hashPassword(password, salt = randomBytes(passwordSaltBytes).toString("base64url")) {
  const hash = scryptSync(normalizePassword(password), salt, scryptKeyLength).toString("base64url");

  return { hash, salt };
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeString(value));
}

function normalizeCloudflareAccount(account = {}, index = 0) {
  return {
    email: normalizeString(account.cfEmail || account.email || "").toLowerCase(),
    globalApiKey: normalizeString(account.cfApiKey || account.globalApiKey || ""),
    name:
      normalizeString(account.cloudflareName || account.cfName || account.name || "") ||
      `Cloudflare ${index + 1}`,
  };
}

function validatePanelUserSetupInput({
  password = "",
  totpCode = "",
  totpSecret = "",
  username = "",
} = {}) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPassword = normalizePassword(password);
  const normalizedTotpSecret = normalizeTotpSecret(totpSecret);

  if (!normalizedUsername || normalizedUsername.length < 3 || normalizedUsername.length > 32) {
    return {
      error: "管理员用户名需为 3-32 个字符，且不能包含空格。",
      statusCode: 400,
    };
  }

  if (normalizedPassword.length < 10 || normalizedPassword.length > 128) {
    return {
      error: "管理员密码需为 10-128 个字符。",
      statusCode: 400,
    };
  }

  if (!normalizedTotpSecret) {
    return {
      error: "必须创建并确认 2FA 登录密钥。",
      statusCode: 400,
    };
  }

  if (!verifyTotp(totpCode, normalizedTotpSecret)) {
    return {
      error: "2FA 验证码错误，请确认已把登录密钥添加到身份验证器。",
      statusCode: 400,
    };
  }

  return {
    normalizedPassword,
    normalizedTotpSecret,
    normalizedUsername,
  };
}

function validateCloudflareAccountsSetupInput(accounts = [], { maxAccounts = 10 } = {}) {
  const normalizedAccounts = (Array.isArray(accounts) ? accounts : [])
    .map(normalizeCloudflareAccount)
    .filter((account) => account.email || account.globalApiKey);

  if (!normalizedAccounts.length) {
    return {
      error: "请至少添加一个 Cloudflare 账号。",
      statusCode: 400,
    };
  }

  if (normalizedAccounts.length > maxAccounts) {
    return {
      error:
        maxAccounts === 1
          ? "每次只能添加一个 Cloudflare 账号。"
          : "首次初始化最多一次添加 10 个 Cloudflare 账号。",
      statusCode: 400,
    };
  }

  const seenEmails = new Set();

  for (const account of normalizedAccounts) {
    if (!isEmail(account.email)) {
      return {
        error: "请输入有效的 Cloudflare 登录邮箱。",
        statusCode: 400,
      };
    }

    if (account.globalApiKey.length < 8 || account.globalApiKey.length > 256) {
      return {
        error: "请输入有效的 Cloudflare Global API Key。",
        statusCode: 400,
      };
    }

    if (seenEmails.has(account.email)) {
      return {
        error: "Cloudflare 登录邮箱不能重复。",
        statusCode: 400,
      };
    }

    seenEmails.add(account.email);
  }

  return { normalizedAccounts };
}

export function verifyTotp(token, secret, { now = Date.now(), window = defaultTotpWindow } = {}) {
  const normalizedToken = normalizeString(token).replace(/\s+/g, "");
  const normalizedSecret = normalizeTotpSecret(secret);

  if (!/^\d{6}$/.test(normalizedToken) || !normalizedSecret) {
    return false;
  }

  let secretBuffer;

  try {
    secretBuffer = base32Decode(normalizedSecret);
  } catch {
    return false;
  }

  const currentCounter = Math.floor(now / 1000 / totpStepSeconds);

  for (let offset = -window; offset <= window; offset += 1) {
    if (safeEqual(hotp(secretBuffer, currentCounter + offset), normalizedToken)) {
      return true;
    }
  }

  return false;
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(totpSecretBytes));
}

export function createOtpAuthUrl({ issuer = "蜘蛛网络", label = "Cloudflare Panel", secret }) {
  const normalizedSecret = normalizeTotpSecret(secret);
  const normalizedIssuer = normalizeString(issuer) || "蜘蛛网络";
  const normalizedLabel = normalizeString(label) || "Cloudflare Panel";
  const params = new URLSearchParams({
    issuer: normalizedIssuer,
    secret: normalizedSecret,
  });

  return `otpauth://totp/${encodeURIComponent(normalizedIssuer)}:${encodeURIComponent(
    normalizedLabel
  )}?${params.toString()}`;
}

export class PanelAuthService {
  constructor({ store } = {}) {
    this.store = store;
  }

  isConfigured() {
    return Boolean(this.store?.hasPanelUser());
  }

  getSetupState() {
    return {
      cloudflareAccountRequired: !this.store?.hasCloudflareAccounts(),
      panelUserRequired: !this.store?.hasPanelUser(),
      setupRequired: !this.store?.hasPanelUser() || !this.store?.hasCloudflareAccounts(),
    };
  }

  verify({ auth = "", password = "", user = "" } = {}) {
    if (!this.isConfigured()) {
      return false;
    }

    const panelUser = this.store.getPanelUser();

    if (!panelUser) {
      return false;
    }

    const { hash } = hashPassword(password, panelUser.passwordSalt);

    return (
      safeEqual(normalizeUsername(user), panelUser.username) &&
      safeEqual(hash, panelUser.passwordHash) &&
      verifyTotp(auth, panelUser.totpSecret)
    );
  }

  createPanelUserSetup({
    password = "",
    totpCode = "",
    totpSecret = "",
    username = "",
  } = {}) {
    const setupState = this.getSetupState();
    const validation = validatePanelUserSetupInput({
      password,
      totpCode,
      totpSecret,
      username,
    });

    if (!setupState.panelUserRequired) {
      return {
        error: "面板管理员已经完成初始化。",
        statusCode: 409,
      };
    }

    if (validation.error) {
      return validation;
    }

    try {
      return this.store.runSetupTransaction(() => {
        const currentSetupState = this.getSetupState();

        if (!currentSetupState.panelUserRequired) {
          return {
            error: "面板管理员已经完成初始化。",
            statusCode: 409,
          };
        }

        const { hash, salt } = hashPassword(validation.normalizedPassword);
        const userRecord = this.store.createPanelUser({
          passwordHash: hash,
          passwordSalt: salt,
          totpSecret: validation.normalizedTotpSecret,
          username: validation.normalizedUsername,
        });

        return {
          statusCode: 201,
          user: userRecord,
        };
      });
    } catch (error) {
      return {
        error: error.message || "初始化失败，请稍后重试。",
        statusCode: 500,
      };
    }
  }

  createCloudflareAccountsSetup({ accounts = [] } = {}) {
    const setupState = this.getSetupState();
    const validation = validateCloudflareAccountsSetupInput(accounts);

    if (setupState.panelUserRequired) {
      return {
        error: "请先创建管理员账户并绑定 2FA。",
        statusCode: 412,
      };
    }

    if (!setupState.cloudflareAccountRequired) {
      return {
        error: "Cloudflare 账号已经完成初始化。",
        statusCode: 409,
      };
    }

    if (validation.error) {
      return validation;
    }

    try {
      return this.store.runSetupTransaction(() => {
        const currentSetupState = this.getSetupState();

        if (currentSetupState.panelUserRequired) {
          return {
            error: "请先创建管理员账户并绑定 2FA。",
            statusCode: 412,
          };
        }

        if (!currentSetupState.cloudflareAccountRequired) {
          return {
            error: "Cloudflare 账号已经完成初始化。",
            statusCode: 409,
          };
        }

        return {
          accounts: this.store.createCloudflareAccounts(validation.normalizedAccounts),
          statusCode: 201,
        };
      });
    } catch (error) {
      return {
        error: error.message || "Cloudflare 账号保存失败，请稍后重试。",
        statusCode: 500,
      };
    }
  }

  createCloudflareAccount({ cloudflareName = "", cfApiKey = "", cfEmail = "" } = {}) {
    const setupState = this.getSetupState();
    const validation = validateCloudflareAccountsSetupInput(
      [{ cfApiKey, cfEmail, cloudflareName }],
      { maxAccounts: 1 }
    );

    if (setupState.panelUserRequired) {
      return {
        error: "请先创建管理员账户并绑定 2FA。",
        statusCode: 412,
      };
    }

    if (validation.error) {
      return validation;
    }

    const account = validation.normalizedAccounts[0];

    if (this.store.hasCloudflareAccountEmail(account.email)) {
      return {
        error: "该 Cloudflare 登录邮箱已存在。",
        statusCode: 409,
      };
    }

    try {
      return this.store.runSetupTransaction(() => {
        if (this.store.hasCloudflareAccountEmail(account.email)) {
          return {
            error: "该 Cloudflare 登录邮箱已存在。",
            statusCode: 409,
          };
        }

        return {
          account: this.store.createCloudflareAccount(account),
          statusCode: 201,
        };
      });
    } catch (error) {
      return {
        error: error.message || "Cloudflare 账号保存失败，请稍后重试。",
        statusCode: 500,
      };
    }
  }

  createSetup({
    cloudflareName = "",
    cfApiKey = "",
    cfEmail = "",
    password = "",
    totpCode = "",
    totpSecret = "",
    username = "",
  } = {}) {
    const userValidation = validatePanelUserSetupInput({
      password,
      totpCode,
      totpSecret,
      username,
    });
    const accountsValidation = validateCloudflareAccountsSetupInput([
      { cfApiKey, cfEmail, cloudflareName },
    ]);

    if (userValidation.error) {
      return userValidation;
    }

    if (accountsValidation.error) {
      return accountsValidation;
    }

    try {
      return this.store.runSetupTransaction(() => {
        const currentSetupState = this.getSetupState();

        if (!currentSetupState.panelUserRequired) {
          return {
            error: "面板管理员已经完成初始化。",
            statusCode: 409,
          };
        }

        if (!currentSetupState.cloudflareAccountRequired) {
          return {
            error: "Cloudflare 账号已经完成初始化。",
            statusCode: 409,
          };
        }

        const { hash, salt } = hashPassword(userValidation.normalizedPassword);
        const userRecord = this.store.createPanelUser({
          passwordHash: hash,
          passwordSalt: salt,
          totpSecret: userValidation.normalizedTotpSecret,
          username: userValidation.normalizedUsername,
        });
        const accounts = this.store.createCloudflareAccounts(
          accountsValidation.normalizedAccounts
        );

        return {
          cloudflareAccount: accounts[0] || null,
          statusCode: 201,
          user: userRecord,
        };
      });
    } catch (error) {
      return {
        error: error.message || "初始化失败，请稍后重试。",
        statusCode: 500,
      };
    }
  }
}
