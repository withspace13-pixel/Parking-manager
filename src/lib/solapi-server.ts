// Solapi 문자 발송 (서버 전용)

import { MessageNotReceivedError, SolapiMessageService } from "solapi";
import {
  classifySolapiStatusCode,
  formatSmsStatusLabel,
  isTerminalStatusCode,
  type SmsDeliveryOutcome,
} from "@/lib/solapi-status";

export type SolapiConfig = {
  apiKey: string;
  apiSecret: string;
  sender: string;
};

export type SmsSendResult = {
  messageId: string;
  to: string;
  statusCode: string;
  statusMessage: string;
  statusLabel: string;
  outcome: SmsDeliveryOutcome;
};

type SolapiFailedMessage = {
  to?: string;
  statusCode?: string;
  statusMessage?: string;
};

type SolapiMessageListItem = {
  messageId?: string;
  statusCode?: string;
  statusMessage?: string;
};

type SolapiSendDetailResponse = {
  failedMessageList?: SolapiFailedMessage[];
  messageList?: SolapiMessageListItem[];
};

type StoredSolapiMessage = {
  messageId?: string;
  to?: string;
  statusCode?: string;
  statusMessage?: string;
  reason?: string | null;
};

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 45000;

export function getSolapiConfig(): SolapiConfig | null {
  const apiKey = process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
  const sender = process.env.SOLAPI_SENDER?.replace(/\D/g, "") ?? "";
  if (!apiKey || !apiSecret || !sender) return null;
  return { apiKey, apiSecret, sender };
}

export function isSolapiConfigured(): boolean {
  return getSolapiConfig() !== null;
}

function createMessageService(): SolapiMessageService {
  const config = getSolapiConfig();
  if (!config) {
    throw new Error(
      "솔라피 API가 설정되지 않았습니다. .env.local에 SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER를 추가해 주세요."
    );
  }
  return new SolapiMessageService(config.apiKey, config.apiSecret);
}

/** 솔라피 발송용 수신번호 (01012345678 형식, 숫자만) */
export function normalizePhoneForSms(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 11) return null;
  if (!digits.startsWith("0")) return null;
  return digits;
}

function isImmediateFailureStatusCode(code: string): boolean {
  if (!code) return true;
  if (code.startsWith("1")) return true;
  if (code.startsWith("2") && code !== "2000") return true;
  return false;
}

function pickFailedMessage(
  failedList: SolapiFailedMessage[] | undefined,
  recipient: string
): SolapiFailedMessage | undefined {
  if (!failedList?.length) return undefined;
  return failedList.find((item) => item.to?.replace(/\D/g, "") === recipient) ?? failedList[0];
}

function assertSendAccepted(
  response: SolapiSendDetailResponse,
  recipient: string
): { messageId: string; statusCode: string; statusMessage: string } {
  const failed = pickFailedMessage(response.failedMessageList, recipient);
  if (failed) {
    throw new Error(failed.statusMessage?.trim() || "문자 접수에 실패했습니다.");
  }

  const listed = response.messageList?.[0];
  if (listed?.statusCode && isImmediateFailureStatusCode(listed.statusCode)) {
    throw new Error(
      listed.statusMessage?.trim() || `문자 접수에 실패했습니다. (코드 ${listed.statusCode})`
    );
  }

  const messageId = listed?.messageId?.trim();
  if (!messageId) {
    throw new Error("솔라피에서 메시지 ID를 받지 못했습니다.");
  }

  return {
    messageId,
    statusCode: listed?.statusCode?.trim() || "2000",
    statusMessage: listed?.statusMessage?.trim() ?? "",
  };
}

function formatSolapiError(err: unknown): string {
  if (err instanceof MessageNotReceivedError) {
    const failed = err.failedMessageList?.[0] as SolapiFailedMessage | undefined;
    if (failed?.statusMessage?.trim()) return failed.statusMessage.trim();
    return err.message;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return "문자 발송에 실패했습니다.";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchStoredMessage(
  messageService: SolapiMessageService,
  messageId: string
): Promise<StoredSolapiMessage | null> {
  const res = (await messageService.getMessages({ messageId, limit: 1 })) as {
    messageList?: Record<string, StoredSolapiMessage>;
  };
  const list = res.messageList ? Object.values(res.messageList) : [];
  return list[0] ?? null;
}

function toSendResult(
  messageId: string,
  to: string,
  statusCode: string,
  statusMessage: string
): SmsSendResult {
  const outcome = classifySolapiStatusCode(statusCode);
  return {
    messageId,
    to,
    statusCode,
    statusMessage,
    statusLabel: formatSmsStatusLabel(statusCode, statusMessage),
    outcome,
  };
}

async function pollMessageUntilTerminal(
  messageService: SolapiMessageService,
  messageId: string,
  to: string,
  initial: { statusCode: string; statusMessage: string }
): Promise<SmsSendResult> {
  let statusCode = initial.statusCode;
  let statusMessage = initial.statusMessage;

  if (isTerminalStatusCode(statusCode)) {
    return toSendResult(messageId, to, statusCode, statusMessage);
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const stored = await fetchStoredMessage(messageService, messageId);
    if (!stored?.statusCode) continue;
    statusCode = String(stored.statusCode).trim();
    statusMessage =
      stored.statusMessage?.trim() || stored.reason?.trim() || statusMessage;
    if (isTerminalStatusCode(statusCode)) {
      return toSendResult(messageId, to, statusCode, statusMessage);
    }
  }

  return toSendResult(messageId, to, statusCode, statusMessage);
}

export async function getSmsStatusByMessageId(messageId: string): Promise<SmsSendResult | null> {
  const messageService = createMessageService();
  const stored = await fetchStoredMessage(messageService, messageId.trim());
  if (!stored?.messageId) return null;
  const statusCode = String(stored.statusCode ?? "").trim() || "2000";
  const statusMessage = stored.statusMessage?.trim() || stored.reason?.trim() || "";
  const to = stored.to?.replace(/\D/g, "") ?? "";
  return toSendResult(stored.messageId, to, statusCode, statusMessage);
}

export async function refreshSmsStatuses(
  messageIds: string[]
): Promise<Record<string, SmsSendResult>> {
  const unique = Array.from(
    new Set(messageIds.map((id) => id.trim()).filter(Boolean))
  );
  const out: Record<string, SmsSendResult> = {};
  for (const id of unique) {
    const status = await getSmsStatusByMessageId(id);
    if (status) out[id] = status;
  }
  return out;
}

export async function sendSmsViaSolapi(
  to: string,
  text: string,
  options?: { waitForDelivery?: boolean }
): Promise<SmsSendResult> {
  const config = getSolapiConfig();
  if (!config) {
    throw new Error(
      "솔라피 API가 설정되지 않았습니다. .env.local에 SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER를 추가해 주세요."
    );
  }

  const recipient = normalizePhoneForSms(to);
  if (!recipient) {
    throw new Error("유효하지 않은 수신번호입니다. 01012345678 형식으로 입력해 주세요.");
  }

  const body = text.trim();
  if (!body) {
    throw new Error("발송할 문구가 비어 있습니다.");
  }

  const messageService = new SolapiMessageService(config.apiKey, config.apiSecret);

  try {
    const result = await messageService.send(
      { to: recipient, from: config.sender, text: body },
      { showMessageList: true }
    );

    const accepted = assertSendAccepted(result as unknown as SolapiSendDetailResponse, recipient);
    if (options?.waitForDelivery) {
      return pollMessageUntilTerminal(messageService, accepted.messageId, recipient, accepted);
    }
    return toSendResult(
      accepted.messageId,
      recipient,
      accepted.statusCode,
      accepted.statusMessage
    );
  } catch (err) {
    throw new Error(formatSolapiError(err));
  }
}

export type SolapiBalanceResult = {
  balance: number;
  point: number;
};

/** 솔라피 충전 잔액·포인트 조회 */
export async function fetchSolapiBalance(): Promise<SolapiBalanceResult> {
  const messageService = createMessageService();
  const res = (await messageService.getBalance()) as { balance?: number; point?: number };
  return {
    balance: Math.round(Number(res.balance ?? 0)),
    point: Math.round(Number(res.point ?? 0)),
  };
}
