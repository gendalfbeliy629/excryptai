export type TelegramSubscriber = {
  chatId: number;
  type: string;
  title?: string;
  username?: string;
  firstName?: string;
  lastSeenAt: string;
};

const subscribers = new Map<number, TelegramSubscriber>();

export function rememberTelegramSubscriber(input: {
  chatId: number;
  type?: string;
  title?: string;
  username?: string;
  firstName?: string;
}) {
  subscribers.set(input.chatId, {
    chatId: input.chatId,
    type: input.type ?? "private",
    title: input.title,
    username: input.username,
    firstName: input.firstName,
    lastSeenAt: new Date().toISOString()
  });
}

export function forgetTelegramSubscriber(chatId: number) {
  subscribers.delete(chatId);
}

export function getTelegramSubscribers(): TelegramSubscriber[] {
  return Array.from(subscribers.values());
}