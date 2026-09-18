export function isValidCPF(cpf: string): boolean {
  const c = cpf.replace(/\D/g, "");
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(c[i]) * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(c[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(c[i]) * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  return d2 === parseInt(c[10]);
}

export function maskCPF(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function maskPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").trim();
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").trim();
}

export function maskCEP(v: string): string {
  return v.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
}

/** Máscara de digitação DD/MM/AAAA (mobile-friendly). */
export function maskBirthDate(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Converte YYYY-MM-DD → DD/MM/AAAA para exibir no campo digitável. */
export function formatBirthDateDisplay(raw: string): string {
  const s = raw.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  }
  return maskBirthDate(s);
}

type BirthParts = { y: number; m: number; d: number };

function parseBirthParts(raw: string): BirthParts | null {
  const s = raw.trim();
  let y: number;
  let m: number;
  let d: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    [y, m, d] = s.split("-").map(Number) as [number, number, number];
  } else {
    const digits = s.replace(/\D/g, "");
    if (digits.length !== 8) return null;
    d = Number(digits.slice(0, 2));
    m = Number(digits.slice(2, 4));
    y = Number(digits.slice(4, 8));
  }
  if (!y || !m || !d) return null;
  const birth = new Date(y, m - 1, d);
  if (Number.isNaN(birth.getTime())) return null;
  if (birth.getFullYear() !== y || birth.getMonth() !== m - 1 || birth.getDate() !== d) return null;
  return { y, m, d };
}

/** Idade em anos completos a partir de YYYY-MM-DD ou DD/MM/AAAA (fuso local). */
export function ageFromBirthDate(raw: string): number | null {
  const parts = parseBirthParts(raw);
  if (!parts) return null;
  const birth = new Date(parts.y, parts.m - 1, parts.d);
  const today = new Date();
  if (birth > today) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function isAdultBirthDate(raw: string, minAge = 18): boolean {
  const age = ageFromBirthDate(raw);
  return age !== null && age >= minAge;
}

export async function fetchAddressByCEP(cep: string) {
  const clean = cep.replace(/\D/g, "");
  if (clean.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    const d = await r.json();
    if (d.erro) return null;
    return {
      street: d.logradouro as string,
      neighborhood: d.bairro as string,
      city: d.localidade as string,
      state: d.uf as string,
    };
  } catch {
    return null;
  }
}
