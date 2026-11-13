export const CHAIN = { id: 1990, name: 'QIE Mainnet', rpc: 'https://rpc1mainnet.qie.digital/', explorer: 'https://mainnet.qie.digital' };
export const CATEGORIES = ['Electronics', 'Office & work', 'Food & hospitality', 'Packaging', 'Services', 'Other'];
export function atomicPrice(value: unknown): string {
  const text = String(value ?? '');
  if (!/^\d{1,12}(\.\d{1,6})?$/.test(text)) throw new Error('Enter a positive price with up to six decimal places.');
  const [whole, fraction = ''] = text.split('.');
  const atoms = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  if (atoms <= 0n) throw new Error('Price must be greater than zero.');
  return atoms.toString();
}
export function displayPrice(atoms: string | number = '0'): string {
  const n = BigInt(atoms); const fraction = (n % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${(n / 1000000n).toLocaleString('en-US')}${fraction ? '.' + fraction : ''}`;
}
