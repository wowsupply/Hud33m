import webpush from 'web-push';

/** Генерирует пару ключей VAPID для Web Push. Ключи кладутся в .env один раз и больше не меняются. */
const keys = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
