// Юнит фильтра «коммерческое предложение вместо события» у Megatix (класс 960/962).
// Запуск: node scripts/dot-megatix-offer-check.mjs
import { isCommercialOffer } from './collect-megatix.mjs';

const OFFERS = [
  'Pangolin Kids Club - 1 CHILD 10-VISIT PASS',
  'Pangolin Kids Club - Standard Hour',
  'Pangolin Kids Club: Trial Pass',
  'ASH Deposit Pass · Free Entry to Nuanu',
  'Fun Day Out Package',
  'Unlimited 2 Hours',
  'Special Family Package',
  'Promo 8.8',
  'Pay Day Sale',
  'Ride and Rental Packages',
  'Halloween Family Deal',
  'November Deal 2026',
  'Gift Card 500K',
  'Monthly Membership',
  'Abonement 10 zanyatiy',
  'Claim Your Free Cocktail at Kuta Social Club',
];

const EVENTS = [
  'Happy Hour at ORYn Ubud',
  'Surf Class',
  'Sundance: Ecstatic Dance',
  'Kecak Dance at Uluwatu',
  'Balinese Cooking Class',
  'Friday DJ & Italian Buffet',
  'Sunday Ecstatic Dance',
  'Kundalini Activation',
  'Passing Through: Art Exhibition',
  'Dealing with Grief: Support Circle',
];

let ok = 0;
const fails = [];
for (const t of OFFERS) {
  if (isCommercialOffer(t)) ok++;
  else fails.push(`не поймано: ${t}`);
}
for (const t of EVENTS) {
  if (!isCommercialOffer(t)) ok++;
  else fails.push(`ложно поймано: ${t}`);
}
const total = OFFERS.length + EVENTS.length;
console.log(`ИТОГ ${fails.length ? 'FAIL' : 'OK'} ${ok}/${total}`);
for (const f of fails) console.log(' -', f);
process.exit(fails.length ? 1 : 0);
