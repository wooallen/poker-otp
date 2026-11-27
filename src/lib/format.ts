export function formatAmount(amount: number): string {
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  if (Number.isInteger(rounded)) {
    return rounded.toLocaleString("en-US");
  }
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatMoney(_currency: string, amount: number): string {
  if (amount < 0) {
    return `-RM${formatAmount(Math.abs(amount))}`;
  }
  return `RM${formatAmount(amount)}`;
}

export function formatSignedMoney(_currency: string, amount: number): string {
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  if (Math.abs(rounded) < 0.01) {
    return "RM0";
  }
  if (rounded > 0) {
    return `+RM${formatAmount(rounded)}`;
  }
  return `-RM${formatAmount(Math.abs(rounded))}`;
}

export function formatClockTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function formatShortTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function formatFullDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-MY", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const datePart = d.toLocaleDateString("en-MY", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const timePart = d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    return `${datePart}, ${timePart}`;
  } catch {
    return "—";
  }
}
