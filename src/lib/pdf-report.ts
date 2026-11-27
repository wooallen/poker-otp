import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatClockTime,
  formatDateTime,
  formatFullDate,
  formatMoney,
} from "./format";
import type { HostRoomSnapshot } from "./types";

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return "In Progress";
  const ms = Date.parse(endIso) - Date.parse(startIso);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function downloadRoomSummaryPdf(snapshot: HostRoomSnapshot): void {
  const { room, totals, players, recentOtps } = snapshot;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;

  const endTimestamp = room.endedAt || snapshot.serverTime;

  // Dark emerald header banner
  doc.setFillColor(12, 24, 33);
  doc.rect(0, 0, pageWidth, 128, "F");

  doc.setTextColor(52, 211, 153); // Emerald accent
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("POKER OTP • SESSION BUY-IN & OTP SUMMARY", marginX, 32);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(`Room: ${room.roomName}`, marginX, 58);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(203, 213, 225);
  doc.text(`Date: ${formatFullDate(room.createdAt)}`, marginX, 80);
  doc.text(`Started: ${formatDateTime(room.createdAt)}`, marginX, 96);
  doc.text(
    `Ended: ${
      room.endedAt
        ? formatDateTime(room.endedAt)
        : `${formatDateTime(endTimestamp)} (Snapshot)`
    }   •   Duration: ${formatDuration(room.createdAt, endTimestamp)}`,
    marginX,
    112
  );

  // Right-aligned grand total badge in header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(251, 191, 36);
  doc.text(
    `Fixed Buy-In: ${formatMoney(room.currency, room.fixedBuyIn)}`,
    pageWidth - marginX,
    54,
    { align: "right" }
  );

  doc.setFontSize(18);
  doc.setTextColor(52, 211, 153);
  doc.text(
    `Total: ${formatMoney(room.currency, totals.grandRunningTotal)}`,
    pageWidth - marginX,
    80,
    { align: "right" }
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `${totals.playerCount} Player${
      totals.playerCount === 1 ? "" : "s"
    }  •  ${totals.totalBuyInUnits} Buy-In${
      totals.totalBuyInUnits === 1 ? "" : "s"
    }`,
    pageWidth - marginX,
    98,
    { align: "right" }
  );

  // ==================== SECTION 1: PLAYER SUMMARY TABLE ====================
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("1. Player Buy-In Summary", marginX, 156);

  const playerRows = players.map((p, index) => {
    const activeChronological = p.buyIns
      .filter((b) => b.status === "ACTIVE")
      .slice()
      .reverse();

    const otpListFormatted =
      activeChronological.length > 0
        ? activeChronological
            .map((b) => `${b.otpCode} (${formatClockTime(b.createdAt)})`)
            .join(", ")
        : "—";

    return [
      String(index + 1),
      p.displayName,
      String(p.buyInCount),
      otpListFormatted,
      formatMoney(room.currency, p.runningTotal),
    ];
  });

  autoTable(doc, {
    startY: 168,
    margin: { left: marginX, right: marginX },
    head: [
      [
        "#",
        "Player Name",
        "Buy-Ins",
        "4-Digit OTP Codes (Timestamped)",
        "Running Total",
      ],
    ],
    body:
      playerRows.length > 0
        ? playerRows
        : [["—", "No players joined", "0", "—", "RM0"]],
    foot: [
      [
        "",
        "ROOM GRAND TOTAL",
        String(totals.totalBuyInUnits),
        `${totals.totalBuyInUnits} Verified OTP${
          totals.totalBuyInUnits === 1 ? "" : "s"
        }`,
        formatMoney(room.currency, totals.grandRunningTotal),
      ],
    ],
    theme: "grid",
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9.5,
    },
    bodyStyles: {
      fontSize: 9.5,
      textColor: [30, 41, 59],
      cellPadding: 6,
    },
    footStyles: {
      fillColor: [236, 253, 245],
      textColor: [6, 95, 70],
      fontStyle: "bold",
      fontSize: 10,
    },
    columnStyles: {
      0: { cellWidth: 28, halign: "center" },
      1: { cellWidth: 110, fontStyle: "bold" },
      2: { cellWidth: 55, halign: "center" },
      3: { cellWidth: "auto", font: "courier" },
      4: { cellWidth: 85, halign: "right", fontStyle: "bold" },
    },
  });

  // ==================== SECTION 2: CHRONOLOGICAL TIMESTAMPED BUY-IN LOG ====================
  const lastTableY =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
      ?.finalY ?? 260;

  let nextSectionY = lastTableY + 30;
  if (nextSectionY > doc.internal.pageSize.getHeight() - 100) {
    doc.addPage();
    nextSectionY = 48;
  }

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(
    "2. Chronological Timestamped Buy-Ins & OTP Ledger",
    marginX,
    nextSectionY
  );

  // Sort active buy-ins oldest -> newest so each player's buy-in # increments cleanly
  const chronologicalActive = recentOtps
    .filter((b) => b.status === "ACTIVE")
    .slice()
    .reverse();

  const perPlayerCounter = new Map<string, number>();
  const ledgerRows = chronologicalActive.map((item, idx) => {
    const pCount = (perPlayerCounter.get(item.playerId) ?? 0) + 1;
    perPlayerCounter.set(item.playerId, pCount);

    return [
      String(idx + 1),
      formatDateTime(item.createdAt),
      item.playerName,
      `Buy-In #${pCount}`,
      item.otpCode,
      formatMoney(room.currency, item.amount),
    ];
  });

  autoTable(doc, {
    startY: nextSectionY + 12,
    margin: { left: marginX, right: marginX },
    head: [
      [
        "#",
        "Timestamp (Date & Time)",
        "Player",
        "Player Buy-In #",
        "OTP Code",
        "Amount",
      ],
    ],
    body:
      ledgerRows.length > 0
        ? ledgerRows
        : [["—", "—", "No buy-ins recorded", "—", "—", "RM0"]],
    theme: "striped",
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9.5,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [30, 41, 59],
      cellPadding: 5.5,
    },
    columnStyles: {
      0: { cellWidth: 28, halign: "center" },
      1: { cellWidth: 135 },
      2: { cellWidth: 115, fontStyle: "bold" },
      3: { cellWidth: 80, halign: "center" },
      4: {
        cellWidth: 75,
        halign: "center",
        font: "courier",
        fontStyle: "bold",
      },
      5: { cellWidth: "auto", halign: "right", fontStyle: "bold" },
    },
  });

  // Page footers
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Room ${room.roomName}  •  Generated ${formatDateTime(
        new Date().toISOString()
      )}  •  Page ${p} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 20,
      { align: "center" }
    );
  }

  const dateTag = new Date(room.createdAt).toISOString().slice(0, 10);
  const safeName = room.roomSlug || "room";
  doc.save(`PokerOTP-${safeName}-${dateTag}.pdf`);
}
