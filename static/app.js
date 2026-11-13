"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
const t = (key, vars) => (window.WT_I18N ? window.WT_I18N.t(key, vars) : key);
const LOCALE = () => {
  const lang = window.WT_I18N ? window.WT_I18N.getLanguage() : "vi";
  return lang === "en" ? "en-US" : lang === "zh" ? "zh-CN" : "vi-VN";
};
const monthTitle = (index) => {
  const name = new Intl.DateTimeFormat(LOCALE(), { month: "long" }).format(new Date(2026, index, 1));
  return name.charAt(0).toUpperCase() + name.slice(1);
};
const MONTHS = Array.from({ length: 12 }, (_, i) => monthTitle(i));
const shortMonth = (month) =>
  new Intl.DateTimeFormat(LOCALE(), { month: "short" }).format(new Date(2026, month - 1, 1));
const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((key) => t(key));
const GRID_DAY_LABELS = (() => {
  const lang = window.WT_I18N ? window.WT_I18N.getLanguage() : "vi";
  if (lang === "en") return ["M", "T", "W", "T", "F", "S", "S"];
  if (lang === "zh") return ["一", "二", "三", "四", "五", "六", "日"];
  return DAY_LABELS;
})();
const gridWeekLabel = (index) => {
  const lang = window.WT_I18N ? window.WT_I18N.getLanguage() : "vi";
  if (lang === "en") return `W${index}`;
  if (lang === "zh") return `第${index}周`;
  return t("Tuần {n}", { n: index });
};
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const state = { year: new Date().getFullYear(), month: new Date().getMonth() + 1, data: null };
let logPrefilled = false;

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const numFmt = new Intl.NumberFormat(LOCALE(), { maximumFractionDigits: 1 });
const fmtNum = (value) => numFmt.format(Number(value) || 0);

/* ---------- units (display only — data is always stored in kg / km) ---------- */

const UNITS_KEY = "wt-units";
const KG_PER_LB = 0.45359237;
const KM_PER_MI = 1.609344;

function readUnits() {
  try {
    const raw = localStorage.getItem(UNITS_KEY);
    if (raw === "metric" || raw === "imperial") return raw;
  } catch {
    /* ignore */
  }
  return "metric";
}

let units = readUnits();
const imperial = () => units === "imperial";
const weightUnit = () => (imperial() ? "lb" : "kg");
const distanceUnit = () => (imperial() ? "mi" : "km");

const roundTo = (value, digits) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const weightFromKg = (kg) => (imperial() ? (Number(kg) || 0) / KG_PER_LB : Number(kg) || 0);
const weightToKg = (value) =>
  imperial() ? roundTo((Number(value) || 0) * KG_PER_LB, 4) : Number(value) || 0;
const distanceFromKm = (km) =>
  imperial() ? (Number(km) || 0) / KM_PER_MI : Number(km) || 0;
const distanceToKm = (value) =>
  imperial() ? roundTo((Number(value) || 0) * KM_PER_MI, 4) : Number(value) || 0;

const fmtWeight = (kg) => `${fmtNum(weightFromKg(kg))} ${weightUnit()}`;
const fmtDistance = (km) => `${fmtNum(distanceFromKm(km))} ${distanceUnit()}`;
const fmtVolume = (kg) => `${fmtNum(weightFromKg(kg))} ${weightUnit()}`;
const displayWeight = (kg) => roundTo(weightFromKg(kg), 1);
const displayDistance = (km) => roundTo(distanceFromKm(km), 2);
const paceValue = (minPerKm) =>
  imperial() ? (Number(minPerKm) || 0) * KM_PER_MI : Number(minPerKm) || 0;

const KIND_LABELS = { strength: t("Tập tạ"), cardio: "Cardio", mobility: t("Giãn cơ") };
const confirmText = (message) =>
  window.confirm(window.WT_I18N ? window.WT_I18N.translateMessage(message) : message);

function formatPace(minPerKm) {
  const value = paceValue(minPerKm);
  if (value <= 0) return "—";
  const minutes = Math.floor(value);
  let seconds = Math.round((value - minutes) * 60);
  if (seconds === 60) return `${minutes + 1}:00/${distanceUnit()}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}/${distanceUnit()}`;
}

function habitById(d) {
  return new Map((d.habits || []).map((habit) => [habit.id, habit]));
}

function habitKind(habit) {
  return habit && KIND_LABELS[habit.kind] ? habit.kind : "strength";
}

const REST_DEFAULT = 90;

function restSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return REST_DEFAULT;
  return Math.max(0, Math.min(3600, Math.round(number)));
}

function habitRestSeconds(habit) {
  return restSeconds(habit && habit.rest_sec);
}

function startHabitRest(habit) {
  if (habitKind(habit) !== "strength") return 0;
  const seconds = habitRestSeconds(habit);
  if (seconds <= 0) return 0;
  startRestTimer(seconds, (habit && habit.name) || "");
  return seconds;
}

function restButtonSeconds(habit) {
  const seconds = habitRestSeconds(habit);
  return seconds > 0 ? seconds : REST_DEFAULT;
}

function scheduleLabel(weekdays) {
  const days = Array.isArray(weekdays) ? weekdays : ALL_DAYS;
  if (days.length === 7) return t("Hằng ngày");
  if (days.length === 5 && days.every((day) => day < 5)) return t("T2–T6");
  return days.map((day) => DAY_LABELS[day]).join("·") || t("Chưa có lịch");
}


async function api(path, options) {
  if (window.WTLocal) {
    await window.WTLocal.ready;
    const payload = await window.WTLocal.request(path, options);
    if (!payload.ok) {
      const message = payload.error || t("Lỗi dữ liệu");
      throw new Error(window.WT_I18N ? window.WT_I18N.translateMessage(message) : message);
    }
    return payload;
  }
  const res = await fetch(path, options);
  let payload;
  try {
    payload = await res.json();
  } catch {
    payload = { ok: false, error: t("Phản hồi không hợp lệ (HTTP {status})", { status: res.status }) };
  }
  if (!res.ok || !payload.ok) throw new Error(payload.error || `HTTP ${res.status}`);
  return payload;
}

const post = (path, body) =>
  api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

async function load() {
  const payload = await api(`/api/state?year=${state.year}&month=${state.month}`);
  state.data = payload.state;
  render();
  checkMilestones(state.data);
}

const firedMilestones = new Set();

function fireMilestone(key, message) {
  if (firedMilestones.has(key)) return;
  firedMilestones.add(key);
  toast(message);
}

function checkMilestones(d) {
  const stats = d && d.stats;
  if (!stats) return;
  const pct = Math.round(stats.overall_pct || 0);
  if (pct >= 100) {
    fireMilestone(
      `goal-${d.year}-${d.month}`,
      t("🎉 Hoàn thành 100% tháng {month}!", { month: MONTHS[d.month - 1] })
    );
  }
  for (const habit of stats.per_habit || []) {
    const streak = habit.streak || 0;
    for (const m of [7, 14, 30, 60]) {
      if (streak >= m) {
        fireMilestone(
          `streak-${habit.id}-${m}`,
          t("🏆 Cột mốc streak {n} ngày cho {name}!", { n: m, name: habit.name })
        );
      }
    }
  }
}

let toastTimer = null;
function toast(message) {
  const node = $("#toast");
  node.textContent = window.WT_I18N ? window.WT_I18N.translateMessage(message) : message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2200);
}

/* ---------------- charts ---------------- */

function barChart(items, { labelEvery = 2, height = 170, width = 780 } = {}) {
  const W = width;
  const H = height;
  const pad = { l: 30, r: 6, t: 12, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const bw = items.length ? iw / items.length : iw;
  const parts = [];

  [0, 25, 50, 75, 100].forEach((value) => {
    const y = pad.t + ih * (1 - value / 100);
    parts.push(`<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}"/>`);
    parts.push(`<text class="axis" x="${pad.l - 6}" y="${y + 3}" text-anchor="end">${value}%</text>`);
  });

  items.forEach((item, index) => {
    const h = Math.max((ih * item.pct) / 100, item.pct > 0 ? 2 : 0);
    const x = pad.l + index * bw + bw * 0.18;
    const w = Math.max(bw * 0.64, 2);
    const y = pad.t + ih - h;
    const title = item.skipped
      ? t("{label}: nghỉ", { label: item.label })
      : `${item.label}: ${item.pct}%${item.deload ? ` · ${t("deload")}` : ""}`;
    const classes = ["bar"];
    if (item.skipped) classes.push("skipped");
    if (item.deload) classes.push("deload");
    parts.push(
      `<rect class="${classes.join(" ")}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1"><title>${esc(title)}</title></rect>`
    );
    if (index % labelEvery === 0) {
      parts.push(
        `<text class="axis" x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(item.label)}</text>`
      );
    }
  });

  return `<svg viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
}

function seriesPath(points, x, y, className) {
  if (!points.length) return "";
  let d = "";
  points.forEach((point, index) => {
    const previous = points[index - 1];
    const command = !previous || point.i - previous.i !== 1 ? "M" : "L";
    d += `${command}${x(point.i).toFixed(1)},${y(point.v).toFixed(1)} `;
  });
  return `<path class="${className}" d="${d.trim()}"/>`;
}

/* ---------------- render ---------------- */

function render() {
  const d = state.data;
  if (!d) return;
  renderGoal(d);
  renderComparison(d);
  renderDaily(d);
  renderWeekly(d);
  renderGrid(d);
  renderRoutines(d);
  renderFocusMode(d);
  renderWorkout(d);
  renderCardio(d);
  renderRecovery(d);
  renderAnalytics(d);
  renderWellness(d);
  renderYearHeatmap(d);
  renderNotes(d);
  renderBackups(d);
  renderTabs();
  renderTodayHint(d);
  renderTodayView(d);
}

function renderGoal(d) {
  const s = d.stats;
  $("#goalPct").textContent = `${Math.round(s.overall_pct)}%`;
  $("#goalDonut").style.setProperty("--pct", s.overall_pct);
  $("#goalDone").textContent = s.total_done;
  $("#goalPossible").textContent = s.total_possible;
  $("#goalDays").textContent = s.counted_days;
}

function renderComparison(d) {
  const el = $("#goalCompare");
  const c = d.comparison;
  if (!c || d.stats.counted_days === 0) {
    el.hidden = true;
    return;
  }
  const delta = c.delta_pct;
  const cls = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "■";
  const sign = delta > 0 ? "+" : "";
  el.hidden = false;
  el.innerHTML = `
    <span class="compare-label">${esc(t("So với {month} {year}", { month: MONTHS[c.month - 1], year: c.year }))}</span>
    <span class="compare-value ${cls}">${arrow} ${sign}${delta}%</span>
    <span class="compare-meta">${c.overall_pct}% · ${t("{done}/{total} lượt", { done: c.total_done, total: c.total_possible })}</span>`;
}

function renderDaily(d) {
  const s = d.stats;
  const items = s.daily.map((day) => ({
    label: String(Number(day.day.slice(8))),
    pct: day.pct,
    skipped: day.skipped,
  }));
  $("#dailyChart").innerHTML = barChart(items, { labelEvery: 2, height: 170, width: 780 });
  $("#dailyHint").textContent = t("{done}/{total} lượt", {
    done: s.total_done,
    total: s.total_possible,
  });
}

function renderWeekly(d) {
  const items = d.stats.weekly.map((week, index) => ({
    label: t("Tuần {n}", { n: index + 1 }),
    pct: week.pct,
    deload: Boolean((d.weeks[index] || {}).deload),
  }));
  $("#weeklyChart").innerHTML = barChart(items, { labelEvery: 1, height: 170, width: 430 });
}

function renderGrid(d) {
  const table = $("#habitGrid");
  const totalDays = d.weeks.reduce((sum, week) => sum + week.days.length, 0);
  const done = new Set(d.entries.map(([habitId, day]) => `${habitId}|${day}`));
  const logByCell = new Map(
    (d.logs || []).map((row) => [`${row.habit_id}|${row.day}`, row])
  );
  const skips = new Map((d.skips || []).map((row) => [row.day, row.reason]));
  const today = d.today;

  const cellClasses = (day, week) => {
    const classes = [];
    if (day === today) classes.push("today-col");
    if (skips.has(day)) classes.push("skipped-col");
    if (week && week.deload) classes.push("deload-col");
    return classes.join(" ");
  };

  const habitsById = habitById(d);

  const logTitle = (habit, log) => {
    const kind = habitKind(habit);
    if (kind === "cardio" && (log.distance_km || 0) > 0) {
      let text = `${fmtDistance(log.distance_km)} · ${fmtNum(log.duration_min)} ${t("phút")} · ${formatPace(log.pace)}`;
      if (log.note) text += ` · ${log.note}`;
      return text;
    }
    if (kind === "mobility" && (log.duration_min || 0) > 0) {
      let text = `${fmtNum(log.duration_min)} ${t("phút")}`;
      if (log.note) text += ` · ${log.note}`;
      return text;
    }
    const load = log.weight > 0 ? fmtWeight(log.weight) : "BW";
    let text = `${log.sets}×${log.reps} @ ${load}`;
    if (log.rpe != null) text += ` · RPE ${fmtNum(log.rpe)}`;
    if (log.note) text += ` · ${log.note}`;
    return text;
  };

  let html = "<thead><tr>";
  html += `<th class="corner" rowspan="3">${esc(t("Bài tập"))}</th>`;
  d.weeks.forEach((week) => {
    html += `<th class="week-head${week.deload ? " is-deload" : ""}" colspan="${week.days.length}">
      <div class="week-head-inner">
        <span>${esc(gridWeekLabel(week.index))}</span>
        <button class="deload-toggle${week.deload ? " on" : ""}" type="button" data-week-deload="${week.monday}" title="${week.deload ? t("Bỏ đánh dấu deload") : t("Đánh dấu tuần này là deload")}" aria-pressed="${Boolean(week.deload)}">${week.deload ? "DELOAD" : "deload"}</button>
      </div>
    </th>`;
  });
  html += "</tr><tr>";
  d.weeks.forEach((week) => {
    week.days.forEach((day) => {
      html += `<th class="dow">${esc(GRID_DAY_LABELS[(new Date(`${day.day}T00:00:00`).getDay() + 6) % 7])}</th>`;
    });
  });
  html += "</tr><tr>";
  d.weeks.forEach((week) => {
    week.days.forEach((day) => {
      html += `<th class="daynum${day.day === d.today ? " today" : ""}">${day.num}</th>`;
    });
  });
  html += "</tr></thead><tbody>";

  if (!d.habits.length) {
    html += `<tr class="empty-row"><td colspan="${totalDays + 1}">${esc(t("Chưa có bài tập. Bấm “+ Bài tập” để bắt đầu."))}</td></tr>`;
  }

  // Hàng "Ngày nghỉ": đánh dấu cả ngày không tính vào % và không đứt chuỗi.
  html += `<tr class="rest-row"><td class="habit-name"><span class="emoji">☾</span><span class="label">${esc(t("Ngày nghỉ"))}</span></td>`;
  d.weeks.forEach((week) => {
    week.days.forEach((day) => {
      const isSkipped = skips.has(day.day);
      const isFuture = day.day > today;
      const reason = isSkipped ? skips.get(day.day) : "";
      const title = isSkipped
        ? reason
          ? t("Nghỉ: {reason}", { reason })
          : t("Đã đánh dấu ngày nghỉ")
        : isFuture
          ? t("Chưa tới ngày này")
          : t("Đánh dấu ngày nghỉ");
      html += `<td class="${cellClasses(day.day, week)}"><button class="skip${isSkipped ? " on" : ""}" data-skip="${day.day}" title="${esc(title)}" aria-pressed="${isSkipped}"${isFuture ? " disabled" : ""}>☾</button></td>`;
    });
  });
  html += "</tr>";

  d.habits.forEach((habit) => {
    const weekdays = Array.isArray(habit.weekdays) ? habit.weekdays : ALL_DAYS;
    const schedule = scheduleLabel(weekdays);
    html += `<tr><td class="habit-name" title="${esc(habit.name)} · ${esc(schedule)}">`;
    html += `<button class="edit" data-edit="${habit.id}" title="${esc(t("Sửa bài tập"))}" aria-label="${esc(t("Sửa {name}", { name: habit.name }))}">✎</button>`;
    html += `<button class="del" data-del="${habit.id}" title="${esc(t("Xoá bài tập"))}" aria-label="${esc(t("Xoá {name}", { name: habit.name }))}">×</button>`;
    html += `<span class="emoji">${esc(habit.emoji)}</span><span class="label">${esc(habit.name)}</span></td>`;
    d.weeks.forEach((week) => {
      week.days.forEach((day) => {
        const isDone = done.has(`${habit.id}|${day.day}`);
        const log = logByCell.get(`${habit.id}|${day.day}`);
        const weekday = (new Date(`${day.day}T00:00:00`).getDay() + 6) % 7;
        const scheduled = weekdays.includes(weekday);
        const isFuture = day.day > today;
        const isSkipped = skips.has(day.day);
        const checkClasses = ["check"];
        if (isDone) checkClasses.push("done");
        if (isDone && !scheduled) checkClasses.push("extra");
        if (log) checkClasses.push("logged");
        const classes = [cellClasses(day.day, week), scheduled ? "" : "off"].filter(Boolean).join(" ");
        let title = isSkipped
          ? t("Ngày nghỉ")
          : isFuture
            ? t("Chưa tới ngày này")
            : scheduled
              ? ""
              : t("Ngoài lịch — không tính vào %");
        if (log && !isFuture && !isSkipped) {
          title = logTitle(habitsById.get(habit.id) || habit, log);
          if (!scheduled) title += ` (${t("Ngoài lịch")})`;
        }
        const titleAttr = title ? ` title="${esc(title)}"` : "";
        html += `<td class="${classes}"><button class="${checkClasses.join(" ")}" data-habit="${habit.id}" data-day="${day.day}" aria-label="${esc(t("{name} ngày {day}", { name: habit.name, day: day.num }))}" aria-pressed="${isDone}"${isFuture || isSkipped ? " disabled" : ""}${titleAttr}></button></td>`;
      });
    });
    html += "</tr>";
  });

  html += "</tbody>";
  table.innerHTML = html;
}

function defaultLogDay(d) {
  const prefix = `${d.year}-${String(d.month).padStart(2, "0")}`;
  const today = d.today || localISODate();
  if (today.startsWith(prefix)) return today;
  const first = `${prefix}-01`;
  // Tháng tương lai: không có ngày hợp lệ nào, giữ ở hôm nay (input có max).
  return first <= today ? first : today;
}

function renderWorkout(d) {
  const select = $("#logHabit");
  const habits = d.habits || [];
  const habitsById = habitById(d);
  const previous = select.value;
  select.innerHTML = habits.length
    ? habits
        .map((habit) => `<option value="${habit.id}">${esc(habit.emoji)} ${esc(habit.name)}</option>`)
        .join("")
    : `<option value="">—</option>`;
  select.disabled = !habits.length;
  if (habits.some((habit) => String(habit.id) === previous)) select.value = previous;
  updateLogFields(habitKind(habitsById.get(Number(select.value))));

  const dayInput = $("#logDay");
  dayInput.max = d.today;
  if (!logPrefilled) {
    const prefix = `${d.year}-${String(d.month).padStart(2, "0")}`;
    if (!dayInput.value.startsWith(prefix)) dayInput.value = defaultLogDay(d);
  }

  const logs = (d.logs || []).slice().reverse();
  const totalVolume = logs.reduce((sum, log) => sum + (log.volume || 0), 0);
  const volumeMonth = d.volume_month != null ? d.volume_month : totalVolume;
  $("#logVolume").textContent = fmtVolume(volumeMonth);
  $("#logCount").textContent = logs.length
    ? t("{n} buổi · {sets} sets", {
        n: logs.length,
        sets: fmtNum(logs.reduce((sum, log) => sum + log.sets, 0)),
      })
    : t("chưa có buổi nào");
  $("#logsHint").textContent = logs.length ? t("{n} buổi trong tháng", { n: logs.length }) : "";

  const names = habitsById;
  const prs = d.prs_by_month || [];
  const deltas = new Map((d.prs_delta || []).map((row) => [row.habit_id, row]));
  $("#prList").innerHTML = prs.length
    ? prs
        .map((pr) => {
          const habit = names.get(pr.habit_id);
          if (!habit) return "";
          const delta = deltas.get(pr.habit_id);
          const deltaText = delta
            ? delta.delta > 0
              ? `<span class="pr-delta up">▲ +${fmtWeight(delta.delta)}</span>`
              : delta.delta < 0
                ? `<span class="pr-delta down">▼ ${fmtWeight(Math.abs(delta.delta))}</span>`
                : `<span class="pr-delta flat">→ ${fmtWeight(delta.delta)}</span>`
            : "";
          return `<span class="pr-chip" title="${esc(t("PR ước tính (Epley) ngày {day}", { day: pr.day }))}">
            <span>${esc(habit.emoji)} ${esc(habit.name)}</span>
            <strong>~${fmtWeight(pr.e1rm)}</strong>
            <span class="pr-day">${esc(formatDay(pr.day))}</span>
            ${deltaText}
          </span>`;
        })
        .join("")
    : `<span class="pr-empty">${esc(t("Chưa có PR — cần log có mức tạ."))}</span>`;

  const list = $("#logList");
  if (!logs.length) {
    list.innerHTML = `<li class="logs-empty">${esc(t("Chưa có buổi tập nào trong tháng này."))}</li>`;
    return;
  }
  list.innerHTML = logs
    .map((log) => {
      const habit = names.get(log.habit_id) || { name: "?", emoji: "" };
      const kind = habitKind(habit);
      let detail;
      let total;
      if (kind === "cardio") {
        detail = `${fmtDistance(log.distance_km)} · ${fmtNum(log.duration_min)} ${t("phút")}`;
        total = formatPace(log.pace);
      } else if (kind === "mobility") {
        detail = `${fmtNum(log.duration_min)} ${t("phút")}`;
        total = "—";
      } else {
        const load = log.weight > 0 ? fmtWeight(log.weight) : "BW";
        detail = `${log.sets}×${log.reps} @ ${load}`;
        total = log.volume > 0 ? fmtVolume(log.volume) : "—";
      }
      const key = `${log.habit_id}|${log.day}`;
      const label = `${habit.name} ${formatDay(log.day)}`;
      const rest = restButtonSeconds(habit);
      return `<li class="log-item">
        <span class="log-when"><button data-log-edit="${key}" title="${esc(t("Sửa buổi tập"))}">${esc(formatDay(log.day))}</button></span>
        <span class="log-name">${esc(habit.emoji)} ${esc(habit.name)}</span>
        <span class="log-detail">${detail}</span>
        <span class="log-total">${total}</span>
        ${log.rpe != null ? `<span class="log-rpe">RPE ${fmtNum(log.rpe)}</span>` : ""}
        <button class="log-rest" data-log-rest="${key}" title="${esc(t("Nghỉ {n} giây", { n: rest }))}" aria-label="${esc(t("Nghỉ {n} giây sau {name}", { n: rest, name: habit.name }))}">⏱</button>
        <button class="log-del" data-log-del="${key}" title="${esc(t("Xoá log (giữ tick)"))}" aria-label="${esc(t("Xoá log {name}", { name: label }))}">×</button>
        ${log.note ? `<span class="log-note">${esc(log.note)}</span>` : ""}
      </li>`;
    })
    .join("");
}

/* ---------------- cardio & mobility ---------------- */

function updateLogFields(kind) {
  const isStrength = kind !== "cardio" && kind !== "mobility";
  document.querySelectorAll("#workoutForm .log-strength").forEach((field) => {
    field.hidden = !isStrength;
  });
  document.querySelectorAll("#workoutForm .log-cardio").forEach((field) => {
    field.hidden = kind !== "cardio";
  });
  document.querySelectorAll("#workoutForm .log-duration").forEach((field) => {
    field.hidden = isStrength;
  });
  // Trường ẩn không tham gia validation (tránh min=1 chặn form của loại bài khác).
  document.querySelectorAll("#workoutForm .log-strength input").forEach((input) => {
    input.disabled = !isStrength;
  });
  document.querySelectorAll("#workoutForm .log-cardio input").forEach((input) => {
    input.disabled = kind !== "cardio";
  });
  document.querySelectorAll("#workoutForm .log-duration input").forEach((input) => {
    input.disabled = isStrength;
  });
  $("#logSets").required = isStrength;
  $("#logReps").required = isStrength;
  $("#logKm").required = kind === "cardio";
  $("#logMinutes").required = kind === "cardio" || kind === "mobility";
}

function valueChart(items, { unit = "", labelEvery = 1, height = 170, width = 780 } = {}) {
  const W = width;
  const H = height;
  const pad = { l: 34, r: 6, t: 12, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const bw = items.length ? iw / items.length : iw;
  const max = Math.max(...items.map((item) => Number(item.value) || 0), 0);
  const scale = max > 0 ? max : 1;
  const parts = [];

  [0, 0.25, 0.5, 0.75, 1].forEach((ratio) => {
    const y = pad.t + ih * (1 - ratio);
    parts.push(`<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}"/>`);
    const value = Math.round(scale * ratio);
    parts.push(
      `<text class="axis" x="${pad.l - 6}" y="${y + 3}" text-anchor="end">${value}${unit}</text>`
    );
  });

  items.forEach((item, index) => {
    const value = Number(item.value) || 0;
    const h = Math.max((ih * value) / scale, value > 0 ? 2 : 0);
    const x = pad.l + index * bw + bw * 0.18;
    const w = Math.max(bw * 0.64, 2);
    const y = pad.t + ih - h;
    const title = `${item.label}: ${fmtNum(value)}${unit}`;
    parts.push(
      `<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1"><title>${esc(title)}</title></rect>`
    );
    if (index % labelEvery === 0) {
      parts.push(
        `<text class="axis" x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(item.label)}</text>`
      );
    }
  });

  return `<svg viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
}

function renderCardio(d) {
  const card = $("#cardioCard");
  const habits = d.habits || [];
  const habitsById = habitById(d);
  const cardioRows = d.cardio_by_habit || [];
  const mobilityRows = d.mobility_by_habit || [];
  const totals = d.cardio_totals || { km: 0, minutes: 0, sessions: 0 };
  const mobility = d.mobility_minutes || { minutes: 0, sessions: 0 };
  const hasCardio = cardioRows.length > 0 || habits.some((habit) => habit.kind === "cardio");
  const hasMobility = mobilityRows.length > 0 || habits.some((habit) => habit.kind === "mobility");
  if (!hasCardio && !hasMobility) {
    card.hidden = true;
    return;
  }
  card.hidden = false;

  const chips = [];
  if (hasCardio) {
    const paceText =
      totals.best_pace > 0
        ? ` · ${t("pace TB {avg} · nhanh nhất {best}", {
            avg: formatPace(totals.avg_pace),
            best: formatPace(totals.best_pace),
          })}`
        : "";
    chips.push(
      `<span class="pr-chip cardio-chip"><span>${esc(t("Cardio tháng"))}</span><strong>${fmtDistance(totals.km)}</strong><span class="pr-day">${t("{minutes} phút · {n} buổi", { minutes: fmtNum(totals.minutes), n: totals.sessions })}${paceText}</span></span>`
    );
    cardioRows.forEach((row) => {
      const habit = habitsById.get(row.habit_id);
      if (!habit) return;
      chips.push(
        `<span class="pr-chip"><span>${esc(habit.emoji)} ${esc(habit.name)}</span><strong>${fmtDistance(row.km)}</strong><span class="pr-day">${t("{n} buổi", { n: row.sessions })}${row.best_pace > 0 ? ` · ${t("nhanh nhất {pace}", { pace: formatPace(row.best_pace) })}` : ""}</span></span>`
      );
    });
  }
  if (hasMobility) {
    chips.push(
      `<span class="pr-chip cardio-chip"><span>${esc(t("Giãn cơ tháng"))}</span><strong>${fmtNum(mobility.minutes)} ${t("phút")}</strong><span class="pr-day">${t("{n} buổi", { n: mobility.sessions })}</span></span>`
    );
    mobilityRows.forEach((row) => {
      const habit = habitsById.get(row.habit_id);
      if (!habit) return;
      chips.push(
        `<span class="pr-chip"><span>${esc(habit.emoji)} ${esc(habit.name)}</span><strong>${fmtNum(row.minutes)} ${t("phút")}</strong><span class="pr-day">${t("{n} buổi", { n: row.sessions })}</span></span>`
      );
    });
  }
  $("#cardioSummary").innerHTML = chips.join("");
  $("#cardioHint").textContent = hasCardio ? t("{unit} theo tuần", { unit: distanceUnit() }) : "";

  const chartBox = $("#cardioChart");
  if (!hasCardio || totals.km <= 0) {
    chartBox.innerHTML = "";
    return;
  }
  // Gộp km cardio của tháng theo cột tuần của bảng tick.
  const cardioHabitIds = new Set(
    habits.filter((habit) => habit.kind === "cardio").map((habit) => habit.id)
  );
  const kmByWeek = d.weeks.map(() => 0);
  (d.logs || []).forEach((log) => {
    if (!cardioHabitIds.has(log.habit_id)) return;
    const weekIndex = d.weeks.findIndex((week) =>
      week.days.some((day) => day.day === log.day)
    );
    if (weekIndex >= 0) kmByWeek[weekIndex] += Number(log.distance_km) || 0;
  });
  chartBox.innerHTML = valueChart(
    kmByWeek.map((km, index) => ({
      label: `T${index + 1}`,
      value: roundTo(distanceFromKm(km), 1),
    })),
    { unit: distanceUnit() }
  );
}

function renderAnalytics(d) {
  const list = $("#analyticsList");
  if (!d.habits.length) {
    list.innerHTML = `<p class="analytics-empty">${esc(t("Chưa có dữ liệu để phân tích."))}</p>`;
    return;
  }
  const habitsById = habitById(d);
  const cardioRows = new Map((d.cardio_by_habit || []).map((row) => [row.habit_id, row]));
  const mobilityRows = new Map((d.mobility_by_habit || []).map((row) => [row.habit_id, row]));
  list.innerHTML = d.stats.per_habit
    .slice(0, 14)
    .map(
      (habit) => {
        const full = habitsById.get(habit.id) || {};
        let prText = "";
        if (habitKind(full) === "cardio") {
          const row = cardioRows.get(habit.id);
          if (row) prText = ` · <span class="pr">${fmtDistance(row.km)} · ${t("nhanh nhất {pace}", { pace: formatPace(row.best_pace) })}</span>`;
        } else if (habitKind(full) === "mobility") {
          const row = mobilityRows.get(habit.id);
          if (row) prText = ` · <span class="pr">${fmtNum(row.minutes)} ${t("phút giãn cơ")}</span>`;
        } else {
          const pr = (d.prs || []).find((row) => row.habit_id === habit.id);
          prText = pr ? ` · <span class="pr">PR ~${fmtWeight(pr.e1rm)}</span>` : "";
        }
        return `
      <div class="analytic">
        <span class="name" title="${esc(habit.name)}">${esc(habit.emoji)} ${esc(habit.name)}</span>
        <span class="pct">${Math.round(habit.pct)}%</span>
        <span class="track"><span class="fill" style="width:${habit.pct}%"></span></span>
        <span class="streak">${esc(scheduleLabel(habit.weekdays))} · ${esc(t("Chuỗi hiện tại {n} · tốt nhất {m} ngày", { n: habit.streak, m: habit.best }))}${prText}</span>
      </div>`;
      }
    )
    .join("");
}

function renderWellness(d) {
  const allDays = d.weeks.flatMap((week) => week.days.map((day) => day.day));
  // Chỉ vẽ tới hôm nay để các điểm dữ liệu trải hết chiều ngang.
  const days = allDays.filter((day) => day <= d.today);
  const byDay = new Map(d.wellness.map((row) => [row.day, row]));

  if (!days.length) {
    $("#wellnessChart").innerHTML = `<p class="analytics-empty">${esc(t("Chưa có dữ liệu wellness cho tháng này."))}</p>`;
    return;
  }

  const W = 1400;
  const H = 190;
  const pad = { l: 36, r: 34, t: 14, b: 24 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (index) =>
    days.length <= 1 ? pad.l + iw / 2 : pad.l + (index / (days.length - 1)) * iw;
  const yMood = (value) => pad.t + ih * (1 - (value - 1) / 4);
  const ySleep = (value) => pad.t + ih * (1 - value / 12);

  const parts = [];
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.t + ih * (i / 4);
    parts.push(`<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}"/>`);
    parts.push(
      `<text class="axis" x="${pad.l - 6}" y="${y + 3}" text-anchor="end">${12 - i * 3}h</text>`
    );
    parts.push(`<text class="axis" x="${W - pad.r + 6}" y="${y + 3}">${5 - i}</text>`);
  }

  days.forEach((day, index) => {
    if (index % 5 === 0 || index === days.length - 1) {
      parts.push(
        `<text class="axis" x="${x(index)}" y="${H - 6}" text-anchor="middle">${esc(day.slice(8))}</text>`
      );
    }
  });

  const moodPoints = [];
  const sleepPoints = [];
  days.forEach((day, index) => {
    const row = byDay.get(day);
    if (!row) return;
    if (row.mood != null) moodPoints.push({ i: index, v: row.mood });
    if (row.sleep != null) sleepPoints.push({ i: index, v: row.sleep });
  });

  parts.push(seriesPath(sleepPoints, x, ySleep, "line-sleep"));
  parts.push(seriesPath(moodPoints, x, yMood, "line-mood"));

  sleepPoints.forEach((point) => {
    parts.push(
      `<circle class="dot-sleep" cx="${x(point.i).toFixed(1)}" cy="${ySleep(point.v).toFixed(1)}" r="1.8"><title>${esc(t("Ngủ {n}h", { n: point.v }))}</title></circle>`
    );
  });
  moodPoints.forEach((point) => {
    parts.push(
      `<circle class="dot-mood" cx="${x(point.i).toFixed(1)}" cy="${yMood(point.v).toFixed(1)}" r="2.8"><title>${esc(t("Tâm trạng {n}/5", { n: point.v }))}</title></circle>`
    );
  });

  $("#wellnessChart").innerHTML = `<svg viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
}

function formatDay(iso) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function renderYearHeatmap(d) {
  const h = d.year_heatmap;
  if (!h) return;
  const byDay = new Map(h.days.map((row) => [row.day, row]));
  const cells = [];

  cells.push('<span class="hm-corner"></span>');
  for (let day = 1; day <= 31; day += 1) {
    cells.push(`<span class="hm-daynum">${day}</span>`);
  }

  for (let month = 1; month <= 12; month += 1) {
    cells.push(`<span class="hm-month">${esc(shortMonth(month))}</span>`);
    const last = new Date(h.year, month, 0).getDate();
    for (let day = 1; day <= 31; day += 1) {
      if (day > last) {
        cells.push('<span class="hm-cell empty"></span>');
        continue;
      }
      const iso = `${h.year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const row = byDay.get(iso);
      const pct = row ? row.pct : 0;
      const skipped = row ? row.skipped : false;
      const deload = row ? row.deload : false;
      const level = skipped ? "skip" : pct >= 100 ? 4 : pct >= 75 ? 3 : pct >= 50 ? 2 : pct > 0 ? 1 : 0;
      const todayClass = iso === d.today ? " today" : "";
      const deloadClass = deload ? " dl" : "";
      const title = skipped
        ? t("{day}/{month}: nghỉ", { day, month })
        : `${day}/${month}: ${pct}%${deload ? ` · ${t("deload")}` : ""}`;
      cells.push(`<span class="hm-cell l${level}${todayClass}${deloadClass}" title="${esc(title)}"></span>`);
    }
  }

  $("#yearHeatmap").innerHTML = cells.join("");
  const s = h.summary;
  $("#heatmapHint").textContent = `${h.year} · ${s.overall_pct}% · ${t("{n} ngày có tính", { n: s.counted_days })}`;
}

function renderNotes(d) {
  const list = $("#notesList");
  const notes = d.notes || [];
  $("#notesHint").textContent = notes.length ? t("{n} ghi chú", { n: notes.length }) : "";
  if (!notes.length) {
    list.innerHTML = `<li class="notes-empty">${esc(t("Chưa có ghi chú nào trong tháng này."))}</li>`;
    return;
  }
  list.innerHTML = notes
    .slice()
    .reverse()
    .map(
      (note) => `
      <li class="note-item">
        <button class="note-day" data-note-edit="${note.day}" title="${esc(t("Sửa ghi chú"))}">${esc(formatDay(note.day))}</button>
        <span class="note-body">${esc(note.text)}</span>
        <button class="note-del" data-note-del="${note.day}" title="${esc(t("Xoá ghi chú"))}" aria-label="${esc(t("Xoá ghi chú ngày {day}", { day: formatDay(note.day) }))}">×</button>
      </li>`
    )
    .join("");
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function formatBackupName(name) {
  const match = /^data-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.db$/.exec(name);
  if (!match) return name;
  return `${match[3]}/${match[2]} · ${match[4]}:${match[5]}:${match[6]}`;
}

function renderBackups(d) {
  const list = $("#backupList");
  const backups = d.backups || [];
  $("#backupHint").textContent = backups.length
    ? t("{n} bản · giữ tối đa 14", { n: backups.length })
    : t("chưa có bản nào");
  if (!backups.length) {
    list.innerHTML = `<li class="backup-empty">${esc(t("Chưa có bản sao lưu. App sẽ tự tạo ở lần mở tiếp theo."))}</li>`;
    return;
  }
  list.innerHTML = backups
    .map(
      (row) => `<li class="backup-item">
        <span class="backup-time">${esc(formatBackupName(row.name))}</span>
        <span class="backup-size">${formatBytes(row.size)}</span>
        <button class="btn ghost" type="button" data-backup-restore="${esc(row.name)}">${esc(t("Khôi phục"))}</button>
      </li>`
    )
    .join("");
}

function renderTabs() {
  const nav = $("#monthTabs");
  nav.innerHTML = MONTHS.map(
    (name, index) =>
      `<button class="month-tab${index + 1 === state.month ? " active" : ""}" data-month="${index + 1}" type="button">${name}</button>`
  ).join("");
}

function renderTodayHint(d) {
  const todayRow = d.stats.daily.find((day) => day.day === d.today);
  let text;
  if (todayRow) {
    text = t("Hôm nay: {done}/{total} bài tập", { done: todayRow.done, total: todayRow.total });
  } else {
    text = MONTHS[d.month - 1];
  }
  if (d.today_week && d.today_week.deload) text += ` · ${t("tuần deload")}`;
  $("#todayHint").textContent = text;
}

/* ---------------- chế độ xem: tháng / hôm nay ---------------- */

const VIEW_KEY = "wt-view";

function readView() {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (raw === "month" || raw === "today") return raw;
  } catch {
    /* ignore */
  }
  return "month";
}

let currentView = readView();

function applyView(view) {
  currentView = view === "today" ? "today" : "month";
  document.body.dataset.view = currentView;
  const todayCard = $("#todayView");
  if (todayCard) todayCard.hidden = currentView !== "today";
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === currentView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function setView(view) {
  const next = view === "today" ? "today" : "month";
  if (next === currentView) return;
  try {
    localStorage.setItem(VIEW_KEY, next);
  } catch {
    /* ignore */
  }
  applyView(next);
  if (next === "today" && state.data) {
    renderTodayView(state.data);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function todayWeekday(d) {
  return (new Date(`${d.today}T00:00:00`).getDay() + 6) % 7;
}

function todayDoneSet(d) {
  return new Set(
    (d.entries || []).filter(([, day]) => day === d.today).map(([habitId]) => Number(habitId))
  );
}

function todayHabits(d) {
  const weekday = todayWeekday(d);
  const done = todayDoneSet(d);
  return (d.habits || []).filter((habit) => {
    const days = Array.isArray(habit.weekdays) ? habit.weekdays : ALL_DAYS;
    return days.includes(weekday) || done.has(habit.id);
  });
}

function todayLogText(habit, log) {
  if (!log) return "";
  const kind = habitKind(habit);
  if (kind === "cardio") {
    return `${fmtDistance(log.distance_km)} · ${fmtNum(log.duration_min)} ${t("phút")}`;
  }
  if (kind === "mobility") return `${fmtNum(log.duration_min)} ${t("phút")}`;
  if (!log.sets && !log.reps) return "";
  return `${log.sets}×${log.reps}${log.weight > 0 ? ` @ ${fmtWeight(log.weight)}` : ""}`;
}

function renderTodayView(d) {
  const card = $("#todayView");
  if (!card) return;

  const dateNode = $("#todayViewDate");
  if (dateNode) {
    const date = new Date(`${d.today}T00:00:00`);
    const text = new Intl.DateTimeFormat(LOCALE(), {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(date);
    dateNode.textContent = text.charAt(0).toUpperCase() + text.slice(1);
  }

  const habits = todayHabits(d);
  const done = todayDoneSet(d);
  const skipped = (d.skips || []).some((row) => row.day === d.today);
  const doneCount = habits.filter((habit) => done.has(habit.id)).length;
  const pct = habits.length ? Math.round((doneCount * 100) / habits.length) : 0;

  const fill = $("#todayProgressFill");
  if (fill) fill.style.width = `${pct}%`;
  const count = $("#todayCount");
  if (count) {
    count.textContent = habits.length
      ? t("{done}/{total} bài", { done: doneCount, total: habits.length })
      : "";
  }

  const list = $("#todayList");
  if (!list) return;
  if (!habits.length) {
    list.innerHTML = `<li class="today-empty">${esc(
      skipped
        ? t("Hôm nay là ngày nghỉ — không có bài nào.")
        : t("Hôm nay chưa có bài nào được lên lịch.")
    )}</li>`;
    return;
  }

  list.innerHTML = habits
    .map((habit) => {
      const isDone = done.has(habit.id);
      const rest = habitRestSeconds(habit);
      const log = (d.logs || []).find(
        (row) => row.habit_id === habit.id && row.day === d.today
      );
      const meta = todayLogText(habit, log) || scheduleLabel(habit.weekdays);
      const restButton =
        habitKind(habit) === "strength" && rest > 0
          ? `<button class="today-mini" type="button" data-rest-start="${rest}" data-rest-label="${esc(habit.name)}" title="${esc(t("Nghỉ {n} giây", { n: rest }))}" aria-label="${esc(t("Nghỉ {n} giây", { n: rest }))}">⏱</button>`
          : "";
      return `<li class="today-item${isDone ? " done" : ""}">
        <button class="today-check" type="button" data-today-toggle="${habit.id}" aria-pressed="${isDone}" aria-label="${esc(`${isDone ? t("Bỏ tick") : t("Tick")} ${habit.name}`)}">${isDone ? "✓" : ""}</button>
        <div class="today-main">
          <span class="today-name"><span class="today-emoji">${esc(habit.emoji)}</span> <span class="today-label">${esc(habit.name)}</span></span>
          <span class="today-meta">${esc(meta)}</span>
        </div>
        <div class="today-actions">
          ${restButton}
          <button class="today-mini" type="button" data-today-log="${habit.id}" title="${esc(t("Ghi chi tiết bài này"))}" aria-label="${esc(t("Log {name}", { name: habit.name }))}">${esc(t("Log"))}</button>
        </div>
      </li>`;
    })
    .join("");
}

function initTodayView() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  applyView(currentView);

  const card = $("#todayView");
  if (card) {
    card.addEventListener("click", (event) => {
      const rest = event.target.closest("[data-rest-start]");
      if (rest) {
        prepareRestAlerts();
        startRestTimer(
          Number(rest.dataset.restStart) || REST_DEFAULT,
          rest.dataset.restLabel || ""
        );
        return;
      }
      if (event.target.closest("[data-rest-stop]")) {
        stopRestTimer();
      }
    });
  }

  const list = $("#todayList");
  if (!list) return;
  list.addEventListener("click", async (event) => {
    const toggle = event.target.closest("[data-today-toggle]");
    if (toggle) {
      if (!state.data) return;
      const habitId = Number(toggle.dataset.todayToggle);
      const day = state.data.today;
      toggle.disabled = true;
      prepareRestAlerts();
      try {
        const result = await post("/api/toggle", { habit_id: habitId, day });
        const habit = habitById(state.data).get(habitId);
        const seconds = result.done ? startHabitRest(habit) : 0;
        if (seconds) toast(t("Nghỉ {n} giây · {name}", { n: seconds, name: habit.name }));
        await load();
      } catch (error) {
        toggle.disabled = false;
        toast(error.message);
      }
      return;
    }

    const log = event.target.closest("[data-today-log]");
    if (log) {
      const habitId = Number(log.dataset.todayLog);
      const day = state.data?.today || localISODate();
      setView("month");
      prefillLog(habitId, day);
    }
  });
}

function initUnits() {
  const select = $("#unitSelect");
  updateUnitControls();
  if (!select) return;
  select.addEventListener("change", () => {
    const next = select.value === "imperial" ? "imperial" : "metric";
    if (next === units) return;
    const wasImperial = imperial();
    const weight = Number($("#logWeight")?.value);
    const distance = Number($("#logKm")?.value);
    units = next;
    try {
      localStorage.setItem(UNITS_KEY, units);
    } catch {
      /* ignore */
    }
    updateUnitControls();
    if (weight > 0) {
      $("#logWeight").value = roundTo(
        wasImperial ? weight * KG_PER_LB : weight / KG_PER_LB,
        1
      );
    }
    if (distance > 0) {
      $("#logKm").value = roundTo(
        wasImperial ? distance * KM_PER_MI : distance / KM_PER_MI,
        2
      );
    }
    if (state.data) render();
    toast(imperial() ? t("Đã đổi sang lb · mi") : t("Đã đổi sang kg · km"));
  });
}

function updateUnitControls() {
  const select = $("#unitSelect");
  if (select) select.value = units;
  const weightLabel = $("#logWeightLabel");
  if (weightLabel) weightLabel.textContent = imperial() ? "Lb" : "Kg";
  const kmLabel = $("#logKmLabel");
  if (kmLabel) kmLabel.textContent = imperial() ? "Mi" : "Km";
  const weightInput = $("#logWeight");
  if (weightInput) {
    weightInput.max = imperial() ? "2205" : "1000";
    // Cho phép số lẻ sau quy đổi lb → kg mà không phá validation của form.
    weightInput.step = "0.1";
  }
  const kmInput = $("#logKm");
  if (kmInput) {
    kmInput.max = imperial() ? "311" : "500";
    kmInput.step = "0.01";
  }
}

function renderRecovery(d) {
  const rec = d.recovery || { action: "normal", reasons: [] };
  const action = ["normal", "light", "deload"].includes(rec.action) ? rec.action : "normal";
  const labels = { normal: t("TỐT"), light: t("NHẸ"), deload: "DELOAD" };
  const el = $("#recoveryAction");
  const reasons = $("#recoveryReasons");
  const hint = $("#recoveryHint");
  el.textContent = labels[action];
  el.className = `recovery-action ${action}`;
  const reasonList = Array.isArray(rec.reasons) ? rec.reasons.slice() : [];
  if (!reasonList.length) {
    reasonList.push(
      action === "normal"
        ? t("Thị trường phục hồi tốt — tiếp tục kế hoạch bình thường.")
        : t("Không có dấu hiệu cần thay đổi.")
    );
  }
  reasons.innerHTML = reasonList
    .map((r) => `<li>${esc(window.WT_I18N ? window.WT_I18N.translateMessage(r) : r)}</li>`)
    .join("");
  hint.textContent = rec.log ? t("Sau buổi: {day}", { day: formatDay(rec.log.day) }) : "";
}

/* ---------------- giáo án (routine) & deload ---------------- */

function formatTime(iso) {
  return iso && iso.length >= 16 ? iso.slice(11, 16) : "";
}

function routineScheduleLabel(weekdays) {
  const days = Array.isArray(weekdays) ? weekdays : [];
  return days.length ? scheduleLabel(days) : t("Tự do");
}

function targetLabel(item) {
  const kind = item.kind || "strength";
  if (kind === "strength") return `${item.target_sets}×${item.target_reps}`;
  return KIND_LABELS[kind] || "";
}

function suggestionLabel(item) {
  const suggestion = item.suggestion;
  if (!suggestion) return (item.kind || "strength") === "strength" ? t("chưa có log") : "";
  const deload = String(suggestion.note || "").toLowerCase().includes("deload");
  return `→ ${fmtWeight(suggestion.weight)} × ${suggestion.reps}${deload ? ` · ${t("deload")}` : ""}`;
}

function renderDeloadBanner(d) {
  const banner = $("#deloadBanner");
  const todayWeek = d.today_week || {};
  if (todayWeek.deload) {
    banner.hidden = false;
    banner.className = "deload-banner on";
    banner.innerHTML = `
      <span class="deload-text">${t("🪫 Tuần này là <strong>deload</strong> — tập nhẹ hơn, giữ kỹ thuật và để cơ thể hồi phục.")}</span>
      <button class="btn ghost" type="button" data-deload-off="${todayWeek.week_start}">${esc(t("Bỏ deload"))}</button>`;
    return;
  }
  const suggestion = d.deload_suggestion;
  if (!suggestion || !suggestion.suggest) {
    banner.hidden = true;
    banner.innerHTML = "";
    return;
  }
  const reasons = Array.isArray(suggestion.reasons) ? suggestion.reasons : [];
  banner.hidden = false;
  banner.className = "deload-banner";
  banner.innerHTML = `
    <span class="deload-text">${t("🪫 <strong>Nên deload tuần này</strong>")}${reasons.length ? ` · ${esc(reasons.map((r) => (window.WT_I18N ? window.WT_I18N.translateMessage(r) : r)).join(" · "))}` : ""}</span>
    <button class="btn" type="button" data-deload-week="${todayWeek.week_start}">${esc(t("Đánh dấu deload"))}</button>`;
}

function sessionOf(routine) {
  return routine.active_session || routine.today_session || null;
}

function sessionDoneSet(session) {
  return new Set((session?.done_habit_ids || []).map((id) => `${id}|${session.day}`));
}

function activeSessionForRoutine(routineId) {
  const routine = (state.data?.routines || []).find((row) => row.id === routineId);
  return routine ? sessionOf(routine) : null;
}

function sessionDurationMin(session) {
  if (!session || !session.started_at) return 0;
  const start = new Date(session.started_at);
  if (Number.isNaN(start.getTime())) return 0;
  const end = session.finished_at ? new Date(session.finished_at) : new Date();
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

async function finishSession(routine, session) {
  if (!routine || !session) return false;
  const total = Number(session.total) || (routine.items || []).length;
  const done = (session.done_habit_ids || []).length;
  if (done < total && !confirmText(t("Còn {n} bài chưa tick. Vẫn kết thúc buổi?", { n: total - done }))) {
    return false;
  }
  await post("/api/sessions/finish", { routine_id: routine.id, day: session.day });
  focusOpen = false;
  focusRoutineId = null;
  const minutes = sessionDurationMin(session);
  toast(
    minutes
      ? t("Đã kết thúc buổi · {done}/{total} bài · {minutes} phút", {
          done,
          total,
          minutes,
        })
      : t("Đã kết thúc buổi · {done}/{total} bài", { done, total })
  );
  await load();
  return true;
}

async function cancelSession(routine, session) {
  if (!routine || !session) return false;
  const when = session.day === state.data?.today ? t("hôm nay") : t("ngày {day}", { day: formatDay(session.day) });
  if (!confirmText(t("Huỷ buổi tập {when}? Các bài đã tick vẫn được giữ.", { when }))) return false;
  await post("/api/sessions/delete", { routine_id: routine.id, day: session.day });
  focusOpen = false;
  focusRoutineId = null;
  toast(t("Đã huỷ buổi tập"));
  await load();
  return true;
}

function renderRoutines(d) {
  const list = $("#routineList");
  const routines = d.routines || [];
  $("#routinesHint").textContent = routines.length
    ? t("{n} giáo án", { n: routines.length })
    : t("chưa có giáo án nào");
  renderDeloadBanner(d);
  if (!routines.length) {
    list.innerHTML = `<p class="routine-empty">${esc(t("Chưa có giáo án. Bấm “+ Giáo án” để tạo buổi tập mẫu (Push / Pull / Legs…), rồi bắt đầu tập theo danh sách."))}</p>`;
    return;
  }
  const todayDow = (new Date(`${d.today}T00:00:00`).getDay() + 6) % 7;
  list.innerHTML = routines
    .map((routine) => routineCard(routine, d, todayDow))
    .join("");
}

function routineCard(routine, d, todayDow) {
  const items = routine.items || [];
  const session = sessionOf(routine);
  const active = Boolean(session && !session.finished_at && items.length);
  const finishedToday = Boolean(
    routine.today_session && routine.today_session.finished_at && items.length
  );
  const scheduled = (routine.weekdays || []).includes(todayDow);

  const badges = [];
  if (scheduled && !active && !finishedToday) {
    badges.push(`<span class="routine-badge today">${esc(t("Hôm nay"))}</span>`);
  }
  if (finishedToday) badges.push(`<span class="routine-badge done">${esc(t("Xong hôm nay"))}</span>`);
  if (active && session.day !== d.today) {
    badges.push(
      `<span class="routine-badge previous">${esc(t("Buổi {day} chưa xong", { day: formatDay(session.day) }))}</span>`
    );
  }

  return `<article class="routine-card">
    <div class="routine-head">
      <span class="routine-title">${esc(routine.emoji)} ${esc(routine.name)}</span>
      <span class="hint">${esc(routineScheduleLabel(routine.weekdays))}</span>
      ${badges.join("")}
      <span class="routine-head-actions">
        <button class="edit" type="button" data-edit-routine="${routine.id}" title="${esc(t("Sửa giáo án"))}" aria-label="${esc(t("Sửa {name}", { name: routine.name }))}">✎</button>
        <button class="del" type="button" data-del-routine="${routine.id}" title="${esc(t("Xoá giáo án"))}" aria-label="${esc(t("Xoá {name}", { name: routine.name }))}">×</button>
      </span>
    </div>
    ${active
      ? sessionBody(routine, items, session, d)
      : itemsBody(routine, items, d, finishedToday, session)}
  </article>`;
}

function itemsBody(routine, items, d, finished, session) {
  const habits = d.habits || [];
  const habitOptions = habits
    .filter((habit) => !items.some((item) => item.habit_id === habit.id))
    .map((habit) => `<option value="${habit.id}">${esc(habit.emoji)} ${esc(habit.name)}</option>`)
    .join("");

  const rows = items
    .map((item) => {
      const target =
        (item.kind || "strength") === "strength"
          ? `<span class="ri-target">
               <input type="number" min="1" max="20" step="1" value="${item.target_sets}" data-ri-field="sets" data-ri-item="${item.id}" aria-label="${esc(t("Sets mục tiêu {name}", { name: item.name }))}" />
               <span class="ri-x">×</span>
               <input type="number" min="1" max="100" step="1" value="${item.target_reps}" data-ri-field="reps" data-ri-item="${item.id}" aria-label="${esc(t("Reps mục tiêu {name}", { name: item.name }))}" />
             </span>`
          : `<span class="ri-kind">${esc(KIND_LABELS[item.kind] || "")}</span>`;
      return `<li class="ri-row">
        <span class="ri-name" title="${esc(item.name)}">${esc(item.emoji)} ${esc(item.name)}</span>
        ${target}
        <span class="ri-suggest">${esc(suggestionLabel(item))}</span>
        <span class="ri-actions">
          <button type="button" data-ri-move="up" data-ri-item="${item.id}" title="${esc(t("Chuyển lên"))}" aria-label="${esc(t("Chuyển {name} lên", { name: item.name }))}">↑</button>
          <button type="button" data-ri-move="down" data-ri-item="${item.id}" title="${esc(t("Chuyển xuống"))}" aria-label="${esc(t("Chuyển {name} xuống", { name: item.name }))}">↓</button>
          <button type="button" data-ri-remove="${item.id}" title="${esc(t("Bỏ khỏi giáo án"))}" aria-label="${esc(t("Bỏ {name} khỏi giáo án", { name: item.name }))}">×</button>
        </span>
      </li>`;
    })
    .join("");

  const empty = items.length
    ? ""
    : `<li class="ri-empty">${esc(t("Chưa có bài nào — chọn bài bên dưới hoặc bấm “+ Bài mới”."))}</li>`;
  const last = routine.last_session && routine.last_session.total > 0
    ? `<span class="hint">${esc(t("Buổi gần nhất {day}: {done}/{total} bài", {
        day: formatDay(routine.last_session.day),
        done: routine.last_session.done,
        total: routine.last_session.total,
      }))}</span>`
    : "";
  const noHabits = habits.length === 0;
  const addPlaceholder = noHabits
    ? t("— chưa có bài tập —")
    : t("— đã thêm hết bài —");
  const callout = noHabits
    ? `<p class="routine-callout">${esc(t("Chưa có bài tập nào trong app. Tạo bài đầu tiên ngay bên dưới — bài mới sẽ được thêm luôn vào giáo án này."))}</p>`
    : "";

  return `
    ${callout}
    <ul class="routine-items">${empty}${rows}</ul>
    <form class="ri-add" data-ri-add="${routine.id}">
      <select class="ri-add-habit" aria-label="${esc(t("Thêm bài tập vào {name}", { name: routine.name }))}"${habitOptions ? "" : " disabled"}>
        ${habitOptions || `<option value="">${addPlaceholder}</option>`}
      </select>
      <input class="ri-add-sets" type="number" min="1" max="20" value="3" aria-label="${esc(t("Sets mục tiêu"))}" />
      <span class="ri-x">×</span>
      <input class="ri-add-reps" type="number" min="1" max="100" value="8" aria-label="${esc(t("Reps mục tiêu"))}" />
      <button class="btn ghost" type="submit"${habitOptions ? "" : " disabled"}>${esc(t("+ Bài"))}</button>
      <button class="btn ghost" type="button" data-ri-new-toggle="${routine.id}">${esc(t("+ Bài mới"))}</button>
    </form>
    <form class="ri-new" data-ri-new="${routine.id}"${noHabits ? "" : " hidden"}>
      <input class="ri-new-name" maxlength="80" data-i18n-placeholder="Tên bài mới (vd: Push-up)" placeholder="${esc(t("Tên bài mới (vd: Push-up)"))}" aria-label="${esc(t("Tên bài tập mới"))}" required />
      <select class="ri-new-kind" aria-label="${esc(t("Loại bài tập"))}">
        <option value="strength">${esc(t("Tập tạ"))}</option>
        <option value="cardio">Cardio</option>
        <option value="mobility">${esc(t("Giãn cơ"))}</option>
      </select>
      <input class="ri-new-sets" type="number" min="1" max="20" value="3" aria-label="${esc(t("Sets mục tiêu"))}" />
      <span class="ri-x">×</span>
      <input class="ri-new-reps" type="number" min="1" max="100" value="8" aria-label="${esc(t("Reps mục tiêu"))}" />
      <button class="btn ghost" type="submit">${esc(t("Tạo & thêm"))}</button>
      <button class="btn ghost" type="button" data-ri-new-cancel>${esc(t("Tắt"))}</button>
    </form>
    <div class="routine-actions">
      <button class="btn" type="button" data-start-routine="${routine.id}"${items.length ? "" : ` disabled title="${esc(t("Thêm bài tập vào giáo án trước"))}"`}>${finished ? esc(t("Tập lại")) : esc(t("Bắt đầu"))}</button>
      ${last}
    </div>`;
}

function sessionBody(routine, items, session, d) {
  const doneSet = sessionDoneSet(session);
  const doneCount = items.filter((item) =>
    doneSet.has(`${item.habit_id}|${session.day}`)
  ).length;
  const pct = items.length ? Math.round((doneCount * 100) / items.length) : 0;
  const allDone = items.length > 0 && doneCount === items.length;
  const rows = items
    .map((item) => {
      const done = doneSet.has(`${item.habit_id}|${session.day}`);
      const rest = restButtonSeconds(item);
      return `<li class="session-item${done ? " done" : ""}">
        <button class="session-check" type="button" data-session-toggle="${item.habit_id}" data-session-day="${session.day}" aria-pressed="${done}" aria-label="${esc(`${done ? t("Bỏ tick") : t("Tick")} ${item.name}`)}">${done ? "✓" : ""}</button>
        <span class="ri-name">${esc(item.emoji)} ${esc(item.name)}</span>
        <span class="hint">${esc(targetLabel(item))}</span>
        <span class="ri-suggest">${esc(suggestionLabel(item))}</span>
        <button class="session-rest" type="button" data-session-rest="${rest}" data-rest-label="${esc(item.name)}" title="${esc(t("Nghỉ {n} giây", { n: rest }))}" aria-label="${esc(t("Nghỉ {n} giây", { n: rest }))}">⏱</button>
        <button class="session-log" type="button" data-session-log="${item.habit_id}" data-session-day="${session.day}" title="${esc(t("Ghi chi tiết bài này"))}" aria-label="${esc(t("Log {name}", { name: item.name }))}">${esc(t("Log"))}</button>
      </li>`;
    })
    .join("");

  return `
    <div class="session-head">
      <span class="session-live">${esc(t("● Đang tập"))}</span>
      <span class="hint">${session.day !== d.today ? `${esc(t("Buổi {day} · ", { day: formatDay(session.day) }))}` : ""}${esc(t("Bắt đầu {time}", { time: formatTime(session.started_at) }))}</span>
      <span class="session-count">${esc(t("{done}/{total} bài", { done: doneCount, total: items.length }))}</span>
    </div>
    <div class="progress-track"><span style="width:${pct}%"></span></div>
    <ul class="session-list">${rows}</ul>
    <div class="routine-actions">
      <button class="btn${allDone ? " complete" : ""}" type="button" data-finish-routine="${routine.id}" data-session-day="${session.day}">${esc(allDone ? t("Kết thúc buổi ✓") : t("Kết thúc buổi"))}</button>
      <button class="btn ghost" type="button" data-cancel-session="${routine.id}" data-session-day="${session.day}">${esc(t("Huỷ"))}</button>
    </div>`;
}

/* ---------------- chế độ tập (focus mode) ---------------- */

let focusRoutineId = null;
let focusOpen = false;
let focusClockId = null;
let wakeLock = null;
let logFromFocus = false;

function activeSessions(d) {
  return (d.routines || []).filter(
    (routine) => routine.active_session && !routine.active_session.finished_at
  );
}

function focusedRoutine(d) {
  const actives = activeSessions(d);
  if (!actives.length) return null;
  return actives.find((routine) => routine.id === focusRoutineId) || actives[0];
}

function elapsedSeconds(startedAt) {
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
}

function fmtElapsed(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function tickFocusClock() {
  const d = state.data;
  if (!d) return;
  const routine = focusedRoutine(d);
  const session = routine && routine.today_session;
  if (!session) return;
  const text = fmtElapsed(elapsedSeconds(session.started_at));
  const elapsed = $("#focusElapsed");
  if (elapsed) elapsed.textContent = text;
  const fabTime = $("#focusFab .fab-time");
  if (fabTime) fabTime.textContent = text;
}

function ensureFocusClock() {
  if (focusClockId) return;
  focusClockId = setInterval(tickFocusClock, 1000);
}

function stopFocusClock() {
  if (focusClockId) {
    clearInterval(focusClockId);
    focusClockId = null;
  }
}

async function requestWakeLock() {
  if (wakeLock || !("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (!wakeLock) return;
  try {
    wakeLock.release();
  } catch {
    /* ignore */
  }
  wakeLock = null;
}

function focusRow(item, session) {
  const done = sessionDoneSet(session).has(`${item.habit_id}|${session.day}`);
  const suggestion = suggestionLabel(item);
  const rest = restButtonSeconds(item);
  return `<li class="focus-item${done ? " done" : ""}">
    <button class="focus-check" type="button" data-focus-toggle="${item.habit_id}" data-session-day="${session.day}" aria-pressed="${done}" aria-label="${esc(`${done ? t("Bỏ tick") : t("Tick")} ${item.name}`)}">${done ? "✓" : ""}</button>
    <div class="focus-item-main">
      <span class="focus-item-name">${esc(item.emoji)} ${esc(item.name)}</span>
      <span class="focus-item-meta">${esc(targetLabel(item))}${suggestion ? ` · ${esc(suggestion)}` : ""}</span>
    </div>
    <div class="focus-item-actions">
      <button class="focus-mini" type="button" data-rest-start="${rest}" data-rest-label="${esc(item.name)}" title="${esc(t("Nghỉ {n} giây", { n: rest }))}" aria-label="${esc(t("Nghỉ {n} giây", { n: rest }))}">⏱</button>
      <button class="focus-mini" type="button" data-focus-log="${item.habit_id}" data-session-day="${session.day}" title="${esc(t("Ghi chi tiết bài này"))}" aria-label="${esc(t("Log {name}", { name: item.name }))}">${esc(t("Log"))}</button>
    </div>
  </li>`;
}

function renderFocusMode(d) {
  const overlay = $("#focusMode");
  const fab = $("#focusFab");
  const actives = activeSessions(d);
  const routine = focusedRoutine(d);
  if (!routine) {
    focusOpen = false;
    focusRoutineId = null;
    overlay.hidden = true;
    fab.hidden = true;
    document.body.classList.remove("focus-open");
    stopFocusClock();
    releaseWakeLock();
    return;
  }

  focusRoutineId = routine.id;
  const session = sessionOf(routine);
  const doneSet = sessionDoneSet(session);
  const items = routine.items || [];
  const doneCount = items.filter((item) =>
    doneSet.has(`${item.habit_id}|${session.day}`)
  ).length;
  const pct = items.length ? Math.round((doneCount * 100) / items.length) : 0;

  $("#focusEmoji").textContent = routine.emoji || "🏋️";
  $("#focusName").textContent = routine.name;
  $("#focusCount").textContent = t("{done}/{total} bài", { done: doneCount, total: items.length });
  const focusDay = $("#focusDay");
  if (focusDay) {
    focusDay.textContent =
      session.day !== d.today ? ` · ${t("buổi {day}", { day: formatDay(session.day) })}` : "";
  }
  $("#focusProgress").style.width = `${pct}%`;
  $("#focusList").innerHTML = items.length
    ? items.map((item) => focusRow(item, session)).join("")
    : `<li class="focus-empty">${esc(t("Giáo án chưa có bài nào."))}</li>`;

  const chips = $("#focusChips");
  chips.hidden = actives.length < 2;
  chips.innerHTML = actives
    .map(
      (row) =>
        `<button class="focus-chip${row.id === routine.id ? " active" : ""}" type="button" data-focus-routine="${row.id}">${esc(row.emoji)} ${esc(row.name)}</button>`
    )
    .join("");

  overlay.hidden = !focusOpen;
  fab.hidden = focusOpen;
  document.body.classList.toggle("focus-open", focusOpen);
  if (focusOpen) requestWakeLock();
  else releaseWakeLock();

  const fabLabel = $("#focusFab .fab-label");
  if (fabLabel) fabLabel.textContent = `${routine.emoji || "🏋️"} ${doneCount}/${items.length}`;

  tickFocusClock();
  ensureFocusClock();
}

function minimizeFocus() {
  focusOpen = false;
  releaseWakeLock();
  if (state.data) renderFocusMode(state.data);
}

function initFocusMode() {
  const overlay = $("#focusMode");

  $("#focusClose").addEventListener("click", minimizeFocus);
  $("#focusFab").addEventListener("click", () => {
    if (!state.data) return;
    focusOpen = true;
    renderFocusMode(state.data);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && focusOpen) minimizeFocus();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (restState.endAt) tickRestTimer();
    if (hiitState.running) tickHiitTimer();
    if (focusOpen || hiitState.running) requestWakeLock();
  });

  overlay.addEventListener("click", async (event) => {
    if (event.target === overlay) {
      minimizeFocus();
      return;
    }

    const chip = event.target.closest("[data-focus-routine]");
    if (chip) {
      focusRoutineId = Number(chip.dataset.focusRoutine);
      renderFocusMode(state.data);
      return;
    }

    const toggle = event.target.closest("[data-focus-toggle]");
    if (toggle) {
      const habitId = Number(toggle.dataset.focusToggle);
      const routine = focusedRoutine(state.data || {});
      const session = sessionOf(routine || {});
      const day = toggle.dataset.sessionDay || session?.day || state.data.today;
      toggle.disabled = true;
      prepareRestAlerts();
      try {
        const result = await post("/api/toggle", { habit_id: habitId, day });
        const habit = habitById(state.data).get(habitId);
        const seconds = result.done ? startHabitRest(habit) : 0;
        if (seconds) toast(t("Nghỉ {n} giây · {name}", { n: seconds, name: habit.name }));
        await load();
        const fresh = focusedRoutine(state.data || {});
        const freshSession = sessionOf(fresh || {});
        if (freshSession && freshSession.done === freshSession.total && freshSession.total > 0) {
          toast("Đã xong tất cả bài — bấm Kết thúc buổi");
        }
      } catch (error) {
        toggle.disabled = false;
        toast(error.message);
      }
      return;
    }

    const rest = event.target.closest("[data-rest-start]");
    if (rest) {
      prepareRestAlerts();
      startRestTimer(Number(rest.dataset.restStart) || REST_DEFAULT, rest.dataset.restLabel || "");
      return;
    }
    if (event.target.closest("[data-rest-stop]")) {
      stopRestTimer();
      return;
    }

    const log = event.target.closest("[data-focus-log]");
    if (log) {
      const habitId = Number(log.dataset.focusLog);
      const routine = focusedRoutine(state.data || {});
      const session = sessionOf(routine || {});
      logFromFocus = Boolean(session);
      focusOpen = false;
      renderFocusMode(state.data);
      prefillLog(habitId, log.dataset.sessionDay || session?.day || state.data.today);
    }
  });

  $("#focusFinish").addEventListener("click", async () => {
    const routine = focusedRoutine(state.data || {});
    if (!routine) return;
    try {
      await finishSession(routine, sessionOf(routine));
    } catch (error) {
      toast(error.message);
    }
  });

  $("#focusCancel").addEventListener("click", async () => {
    const routine = focusedRoutine(state.data || {});
    if (!routine) return;
    try {
      await cancelSession(routine, sessionOf(routine));
    } catch (error) {
      toast(error.message);
    }
  });
}

/* ---------------- events ---------------- */

function initSelectors() {
  const yearSelect = $("#yearSelect");
  const monthSelect = $("#monthSelect");
  const currentYear = new Date().getFullYear();
  for (let year = currentYear - 4; year <= currentYear + 2; year += 1) {
    yearSelect.add(new Option(String(year), String(year)));
  }
  MONTHS.forEach((name, index) => monthSelect.add(new Option(name, String(index + 1))));
  yearSelect.value = String(state.year);
  monthSelect.value = String(state.month);

  yearSelect.addEventListener("change", () => {
    state.year = Number(yearSelect.value);
    load().catch((error) => toast(error.message));
  });
  monthSelect.addEventListener("change", () => {
    state.month = Number(monthSelect.value);
    load().catch((error) => toast(error.message));
  });
}

function initGrid() {
  $("#habitGrid").addEventListener("click", async (event) => {
    const deloadWeek = event.target.closest("[data-week-deload]");
    if (deloadWeek) {
      const week = deloadWeek.dataset.weekDeload;
      const isOn = deloadWeek.classList.contains("on");
      try {
        if (isOn) await post("/api/deload/delete", { week_start: week });
        else await post("/api/deload", { week_start: week });
        toast(isOn ? "Đã bỏ deload" : "Đã đánh dấu tuần deload");
        await load();
      } catch (error) {
        toast(error.message);
      }
      return;
    }

    const skipButton = event.target.closest("[data-skip]");
    if (skipButton) {
      const day = skipButton.dataset.skip;
      const current = (state.data.skips || []).find((row) => row.day === day);
      try {
        if (current) {
          await post("/api/skips/delete", { day });
          toast("Đã bỏ ngày nghỉ");
        } else {
          const reason = window.prompt(
            t("Lý do nghỉ ngày {day}? (bỏ trống nếu không cần)", { day }),
            ""
          );
          if (reason === null) return;
          await post("/api/skips", { day, reason });
          toast("Đã đánh dấu ngày nghỉ");
        }
        await load();
      } catch (error) {
        toast(error.message);
      }
      return;
    }

    const check = event.target.closest("[data-habit]");
    if (check) {
      if (event.shiftKey) {
        event.preventDefault();
        prefillLog(Number(check.dataset.habit), check.dataset.day);
        return;
      }
      check.disabled = true;
      try {
        await post("/api/toggle", { habit_id: Number(check.dataset.habit), day: check.dataset.day });
        await load();
      } catch (error) {
        toast(error.message);
      } finally {
        check.disabled = false;
      }
      return;
    }

    const edit = event.target.closest("[data-edit]");
    if (edit) {
      const habit = (state.data.habits || []).find((row) => row.id === Number(edit.dataset.edit));
      if (habit) openHabitForm(habit);
      return;
    }

    const remove = event.target.closest("[data-del]");
    if (remove) {
      const habitId = Number(remove.dataset.del);
      if (!confirmText(t("Xoá bài tập này và toàn bộ lịch sử của nó?"))) return;
      try {
        await post("/api/habits/delete", { id: habitId });
        toast("Đã xoá bài tập");
        await load();
      } catch (error) {
        toast(error.message);
      }
    }
  });
}

let editingId = null;

function renderWeekdayPicker(container, selected) {
  const days = Array.isArray(selected) ? selected : ALL_DAYS;
  container.innerHTML = DAY_LABELS.map(
    (label, index) =>
      `<label class="wd"><input type="checkbox" value="${index}"${days.includes(index) ? " checked" : ""}/><span>${label}</span></label>`
  ).join("");
}

function openHabitForm(habit) {
  editingId = habit ? habit.id : null;
  $("#habitEmoji").value = habit ? habit.emoji : "";
  $("#habitName").value = habit ? habit.name : "";
  $("#habitKind").value = habit ? habitKind(habit) : "strength";
  $("#habitRest").value = habit ? habitRestSeconds(habit) : REST_DEFAULT;
  renderWeekdayPicker($("#habitDays"), habit ? habit.weekdays : ALL_DAYS);
  $("#habitSubmit").textContent = habit ? t("Lưu") : t("Thêm");
  const form = $("#addHabitForm");
  form.hidden = false;
  $("#habitName").focus();
  form.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function closeHabitForm() {
  editingId = null;
  const form = $("#addHabitForm");
  form.reset();
  form.hidden = true;
  renderWeekdayPicker($("#habitDays"), ALL_DAYS);
}

function initAddHabit() {
  const form = $("#addHabitForm");
  renderWeekdayPicker($("#habitDays"), ALL_DAYS);
  $("#addHabitBtn").addEventListener("click", () => {
    if (form.hidden) openHabitForm(null);
    else closeHabitForm();
  });
  $("#cancelAdd").addEventListener("click", closeHabitForm);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("#habitName").value.trim();
    const emoji = $("#habitEmoji").value.trim();
    const kind = $("#habitKind").value;
    const restRaw = $("#habitRest").value.trim();
    const restSec = restRaw === "" ? REST_DEFAULT : Number(restRaw);
    if (!Number.isInteger(restSec) || restSec < 0 || restSec > 3600) {
      toast("Thời gian nghỉ phải từ 0 đến 3600 giây");
      return;
    }
    const weekdays = [...form.querySelectorAll('#habitDays input[type="checkbox"]:checked')].map(
      (input) => Number(input.value)
    );
    if (!name) return;
    if (!weekdays.length) {
      toast("Chọn ít nhất một ngày tập");
      return;
    }
    try {
      if (editingId) {
        await post("/api/habits/update", { id: editingId, name, emoji, weekdays, kind, rest_sec: restSec });
        toast("Đã cập nhật bài tập");
      } else {
        await post("/api/habits", { name, emoji, weekdays, kind, rest_sec: restSec });
        toast("Đã thêm bài tập");
      }
      closeHabitForm();
      await load();
    } catch (error) {
      toast(error.message);
    }
  });
}

let editingRoutineId = null;

function openRoutineForm(routine) {
  editingRoutineId = routine ? routine.id : null;
  $("#routineEmoji").value = routine ? routine.emoji : "";
  $("#routineName").value = routine ? routine.name : "";
  renderWeekdayPicker(
    $("#routineDays"),
    routine && Array.isArray(routine.weekdays) ? routine.weekdays : []
  );
  $("#routineSubmit").textContent = routine ? t("Lưu") : t("Tạo");
  const form = $("#routineForm");
  form.hidden = false;
  $("#routineName").focus();
  form.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function closeRoutineForm() {
  editingRoutineId = null;
  const form = $("#routineForm");
  form.reset();
  form.hidden = true;
  renderWeekdayPicker($("#routineDays"), []);
}

async function handleRoutineClick(event) {
  const edit = event.target.closest("[data-edit-routine]");
  if (edit) {
    const routine = (state.data?.routines || []).find(
      (row) => row.id === Number(edit.dataset.editRoutine)
    );
    if (routine) openRoutineForm(routine);
    return;
  }

  const remove = event.target.closest("[data-del-routine]");
  if (remove) {
    if (!confirmText(t("Xoá giáo án này? Bài tập, tick và log vẫn được giữ."))) return;
    try {
      await post("/api/routines/delete", { id: Number(remove.dataset.delRoutine) });
      toast("Đã xoá giáo án");
      await load();
    } catch (error) {
      toast(error.message);
    }
    return;
  }

  const start = event.target.closest("[data-start-routine]");
  if (start) {
    const routineId = Number(start.dataset.startRoutine);
    const routine = (state.data?.routines || []).find((row) => row.id === routineId);
    const finishedToday = Boolean(routine?.today_session?.finished_at);
    if (
      finishedToday &&
      !confirmText(t("Tập lại buổi hôm nay? Các bài đã tick trong giáo án sẽ được bỏ tick."))
    ) {
      return;
    }
    focusRoutineId = routineId;
    focusOpen = true;
    try {
      await post("/api/sessions/start", {
        routine_id: routineId,
        day: state.data.today,
        reset: finishedToday,
      });
      toast("Bắt đầu buổi tập");
      await load();
    } catch (error) {
      focusOpen = false;
      toast(error.message);
    }
    return;
  }

  const finish = event.target.closest("[data-finish-routine]");
  if (finish) {
    const routineId = Number(finish.dataset.finishRoutine);
    const routine = (state.data?.routines || []).find((row) => row.id === routineId);
    try {
      await finishSession(routine, routine ? sessionOf(routine) : null);
    } catch (error) {
      toast(error.message);
    }
    return;
  }

  const cancel = event.target.closest("[data-cancel-session]");
  if (cancel) {
    const routineId = Number(cancel.dataset.cancelSession);
    const routine = (state.data?.routines || []).find((row) => row.id === routineId);
    try {
      await cancelSession(routine, routine ? sessionOf(routine) : null);
    } catch (error) {
      toast(error.message);
    }
    return;
  }

  const toggle = event.target.closest("[data-session-toggle]");
  if (toggle) {
    const habitId = Number(toggle.dataset.sessionToggle);
    const day = toggle.dataset.sessionDay || state.data.today;
    toggle.disabled = true;
    prepareRestAlerts();
    try {
      const result = await post("/api/toggle", { habit_id: habitId, day });
      const habit = habitById(state.data).get(habitId);
      const seconds = result.done ? startHabitRest(habit) : 0;
      if (seconds) toast(t("Nghỉ {n} giây · {name}", { n: seconds, name: habit.name }));
      await load();
      const fresh = (state.data?.routines || []).find((routine) =>
        (routine.items || []).some((item) => item.habit_id === habitId)
      );
      const freshSession = fresh ? sessionOf(fresh) : null;
      if (
        freshSession &&
        freshSession.total > 0 &&
        freshSession.done === freshSession.total
      ) {
        toast("Đã xong tất cả bài — bấm Kết thúc buổi");
      }
    } catch (error) {
      toggle.disabled = false;
      toast(error.message);
    }
    return;
  }

  const rest = event.target.closest("[data-session-rest]");
  if (rest) {
    prepareRestAlerts();
    const seconds = Number(rest.dataset.sessionRest) || REST_DEFAULT;
    startRestTimer(seconds, rest.dataset.restLabel || "");
    toast(t("Bắt đầu nghỉ {n} giây", { n: seconds }));
    return;
  }

  const log = event.target.closest("[data-session-log]");
  if (log) {
    prefillLog(
      Number(log.dataset.sessionLog),
      log.dataset.sessionDay || state.data.today
    );
    return;
  }

  const newToggle = event.target.closest("[data-ri-new-toggle]");
  if (newToggle) {
    const form = document.querySelector(
      `[data-ri-new="${newToggle.dataset.riNewToggle}"]`
    );
    if (form) {
      form.hidden = false;
      form.querySelector(".ri-new-name")?.focus();
    }
    return;
  }

  const newCancel = event.target.closest("[data-ri-new-cancel]");
  if (newCancel) {
    const form = newCancel.closest("[data-ri-new]");
    if (form) {
      form.hidden = true;
      form.reset();
    }
    return;
  }

  const move = event.target.closest("[data-ri-move]");
  if (move) {
    try {
      await post("/api/routines/items/move", {
        id: Number(move.dataset.riItem),
        direction: move.dataset.riMove,
      });
      await load();
    } catch (error) {
      toast(error.message);
    }
    return;
  }

  const removeItem = event.target.closest("[data-ri-remove]");
  if (removeItem) {
    try {
      await post("/api/routines/items/delete", {
        id: Number(removeItem.dataset.riRemove),
      });
      toast("Đã bỏ bài khỏi giáo án");
      await load();
    } catch (error) {
      toast(error.message);
    }
  }
}

async function handleRoutineChange(event) {
  const input = event.target.closest("[data-ri-field]");
  if (!input) return;
  const row = input.closest(".ri-row");
  if (!row) return;
  const setsInput = row.querySelector('[data-ri-field="sets"]');
  const repsInput = row.querySelector('[data-ri-field="reps"]');
  if (!setsInput || !repsInput) return;
  try {
    await post("/api/routines/items/update", {
      id: Number(input.dataset.riItem),
      target_sets: Number(setsInput.value),
      target_reps: Number(repsInput.value),
    });
    toast("Đã cập nhật bài trong giáo án");
    await load();
  } catch (error) {
    toast(error.message);
  }
}

async function handleRoutineAdd(event) {
  const newForm = event.target.closest("[data-ri-new]");
  const addForm = event.target.closest("[data-ri-add]");
  if (!newForm && !addForm) return;
  event.preventDefault();

  if (newForm) {
    const routineId = Number(newForm.dataset.riNew);
    const routine = (state.data?.routines || []).find((row) => row.id === routineId);
    const name = newForm.querySelector(".ri-new-name").value.trim();
    if (!name) {
      toast("Nhập tên bài tập mới");
      return;
    }
    const kind = newForm.querySelector(".ri-new-kind").value;
    const targetSets = Number(newForm.querySelector(".ri-new-sets").value || 3);
    const targetReps = Number(newForm.querySelector(".ri-new-reps").value || 8);
    const weekdays =
      routine && Array.isArray(routine.weekdays) && routine.weekdays.length
        ? routine.weekdays
        : ALL_DAYS;
    try {
      await post("/api/routines/items/new", {
        routine_id: routineId,
        name,
        emoji: "",
        weekdays,
        kind,
        target_sets: targetSets,
        target_reps: targetReps,
      });
      toast(t("Đã tạo “{name}” và thêm vào giáo án", { name }));
      await load();
    } catch (error) {
      toast(error.message);
    }
    return;
  }

  const habitId = Number(addForm.querySelector(".ri-add-habit").value);
  if (!habitId) return;
  try {
    await post("/api/routines/items", {
      routine_id: Number(addForm.dataset.riAdd),
      habit_id: habitId,
      target_sets: Number(addForm.querySelector(".ri-add-sets").value || 3),
      target_reps: Number(addForm.querySelector(".ri-add-reps").value || 8),
    });
    toast("Đã thêm bài vào giáo án");
    await load();
  } catch (error) {
    toast(error.message);
  }
}

async function handleDeloadClick(event) {
  const on = event.target.closest("[data-deload-week]");
  const off = event.target.closest("[data-deload-off]");
  try {
    if (on) {
      await post("/api/deload", { week_start: on.dataset.deloadWeek });
      toast("Đã đánh dấu tuần deload");
    } else if (off) {
      await post("/api/deload/delete", { week_start: off.dataset.deloadOff });
      toast("Đã bỏ deload");
    } else {
      return;
    }
    await load();
  } catch (error) {
    toast(error.message);
  }
}

function initRoutines() {
  const form = $("#routineForm");
  renderWeekdayPicker($("#routineDays"), []);

  $("#addRoutineBtn").addEventListener("click", () => {
    if (form.hidden) openRoutineForm(null);
    else closeRoutineForm();
  });
  $("#routineCancel").addEventListener("click", closeRoutineForm);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("#routineName").value.trim();
    const emoji = $("#routineEmoji").value.trim();
    const weekdays = [
      ...form.querySelectorAll('#routineDays input[type="checkbox"]:checked'),
    ].map((input) => Number(input.value));
    if (!name) return;
    try {
      if (editingRoutineId) {
        await post("/api/routines/update", {
          id: editingRoutineId,
          name,
          emoji,
          weekdays,
        });
        toast("Đã cập nhật giáo án");
      } else {
        await post("/api/routines", { name, emoji, weekdays });
        toast("Đã tạo giáo án");
      }
      closeRoutineForm();
      await load();
    } catch (error) {
      toast(error.message);
    }
  });

  $("#routineList").addEventListener("click", handleRoutineClick);
  $("#routineList").addEventListener("change", handleRoutineChange);
  $("#routineList").addEventListener("submit", handleRoutineAdd);
  $("#deloadBanner").addEventListener("click", handleDeloadClick);
}

function localISODate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function initWellness() {
  const form = $("#wellnessForm");
  const dayInput = $("#wellnessDay");
  dayInput.value = localISODate();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mood = $("#wellnessMood").value;
    const sleep = $("#wellnessSleep").value;
    try {
      await post("/api/wellness", {
        day: dayInput.value,
        mood: mood === "" ? null : Number(mood),
        sleep: sleep === "" ? null : Number(sleep),
      });
      toast("Đã lưu wellness");
      await load();
    } catch (error) {
      toast(error.message);
    }
  });
}

function initNotes() {
  const form = $("#notesForm");
  const dayInput = $("#noteDay");
  const textInput = $("#noteText");
  dayInput.value = localISODate();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = textInput.value.trim();
    try {
      await post("/api/notes", { day: dayInput.value, text });
      toast(text ? "Đã lưu ghi chú" : "Đã xoá ghi chú");
      textInput.value = "";
      await load();
    } catch (error) {
      toast(error.message);
    }
  });

  $("#notesList").addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-note-edit]");
    if (edit) {
      const note = (state.data.notes || []).find((row) => row.day === edit.dataset.noteEdit);
      if (!note) return;
      dayInput.value = note.day;
      textInput.value = note.text;
      textInput.focus();
      form.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    const remove = event.target.closest("[data-note-del]");
    if (remove) {
      try {
        await post("/api/notes", { day: remove.dataset.noteDel, text: "" });
        toast("Đã xoá ghi chú");
        await load();
      } catch (error) {
        toast(error.message);
      }
    }
  });
}

function setLogPrefilled(value) {
  logPrefilled = value;
  $("#logCancel").hidden = !value;
}

function findLog(habitId, day) {
  return (state.data?.logs || []).find(
    (row) => row.habit_id === habitId && row.day === day
  );
}

function prefillLog(habitId, day) {
  if (!state.data) return;
  $("#logDay").value = day;
  const select = $("#logHabit");
  if ([...select.options].some((option) => option.value === String(habitId))) {
    select.value = String(habitId);
  }
  const habit = habitById(state.data).get(Number(habitId));
  const kind = habitKind(habit);
  updateLogFields(kind);
  const existing = findLog(habitId, day);
  if (existing) {
    $("#logSets").value = existing.sets;
    $("#logReps").value = existing.reps;
    $("#logWeight").value = existing.weight != null ? displayWeight(existing.weight) : "";
    $("#logRpe").value = existing.rpe == null ? "" : existing.rpe;
    $("#logNote").value = existing.note || "";
    $("#logKm").value =
      existing.distance_km != null ? displayDistance(existing.distance_km) : "";
    $("#logMinutes").value = existing.duration_min != null ? existing.duration_min : "";
  } else if (kind !== "strength") {
    $("#logKm").value = "";
    $("#logMinutes").value = "";
  }
  setLogPrefilled(true);
  $("#workoutForm").scrollIntoView({ block: "center", behavior: "smooth" });
  const focusField = kind === "strength" ? $("#logSets") : kind === "cardio" ? $("#logKm") : $("#logMinutes");
  focusField.focus({ preventScroll: true });
}

function initWorkout() {
  const form = $("#workoutForm");
  const dayInput = $("#logDay");
  dayInput.value = localISODate();

  $("#logHabit").addEventListener("change", () => {
    const habit = state.data && habitById(state.data).get(Number($("#logHabit").value));
    updateLogFields(habitKind(habit));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    prepareRestAlerts();
    const habitId = Number($("#logHabit").value);
    if (!habitId) {
      toast("Chưa có bài tập để log");
      return;
    }
    const habit = state.data && habitById(state.data).get(habitId);
    const kind = habitKind(habit);
    const rpeRaw = $("#logRpe").value.trim();
    const body = {
      habit_id: habitId,
      day: dayInput.value,
      rpe: rpeRaw === "" ? null : Number(rpeRaw),
      note: $("#logNote").value.trim(),
    };
    if (kind === "cardio") {
      body.distance_km = distanceToKm($("#logKm").value);
      body.duration_min = Number($("#logMinutes").value);
    } else if (kind === "mobility") {
      body.duration_min = Number($("#logMinutes").value);
    } else {
      body.sets = Number($("#logSets").value);
      body.reps = Number($("#logReps").value);
      body.weight = weightToKg(Number($("#logWeight").value || 0));
    }
    try {
      await post("/api/logs", body);
      const rest = startHabitRest(habit);
      toast(rest ? t("Đã lưu · nghỉ {n} giây", { n: rest }) : t("Đã lưu buổi tập"));
      $("#logNote").value = "";
      $("#logRpe").value = "";
      setLogPrefilled(false);
      await load();
      if (logFromFocus && state.data && focusedRoutine(state.data)) {
        focusOpen = true;
        renderFocusMode(state.data);
      }
      logFromFocus = false;
    } catch (error) {
      toast(error.message);
    }
  });

  $("#logCancel").addEventListener("click", () => {
    $("#logNote").value = "";
    $("#logRpe").value = "";
    $("#logKm").value = "";
    $("#logMinutes").value = "";
    setLogPrefilled(false);
    if (state.data) dayInput.value = defaultLogDay(state.data);
  });

  $("#logList").addEventListener("click", async (event) => {
    const remove = event.target.closest("[data-log-del]");
    if (remove) {
      const [habitId, day] = remove.dataset.logDel.split("|");
      if (!confirmText(t("Xoá log của buổi này? Tick ngày vẫn được giữ."))) return;
      try {
        await post("/api/logs/delete", { habit_id: Number(habitId), day });
        toast("Đã xoá log");
        setLogPrefilled(false);
        await load();
      } catch (error) {
        toast(error.message);
      }
      return;
    }
    const restButton = event.target.closest("[data-log-rest]");
    if (restButton) {
      prepareRestAlerts();
      const habitId = Number(restButton.dataset.logRest.split("|")[0]);
      const habit = habitById(state.data).get(habitId);
      startRestTimer(restButtonSeconds(habit), (habit && habit.name) || "");
      return;
    }
    const edit = event.target.closest("[data-log-edit]");
    if (edit) {
      const [habitId, day] = edit.dataset.logEdit.split("|");
      prefillLog(Number(habitId), day);
    }
  });
}

/* ---------- rest timer ---------- */

const REST_SOUND_KEY = "workout-tracker-rest-sound";
const REST_VIBRATE_KEY = "workout-tracker-rest-vibrate";
const restState = {
  endAt: null,
  duration: REST_DEFAULT,
  timerId: null,
  label: "",
  completed: false,
};
let restSoundOn = readStoredBool(REST_SOUND_KEY, true);
let restVibrateOn = readStoredBool(REST_VIBRATE_KEY, true);
let audioCtx = null;

function readStoredBool(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "1";
  } catch {
    return fallback;
  }
}

function storeBool(key, value) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function fmtRest(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function renderRestUi(remaining, duration, running) {
  const safeDuration = Math.max(1, Number(duration) || 1);
  const pct = Math.max(0, Math.min(100, (remaining / safeDuration) * 100));
  document.querySelectorAll("[data-rest-time]").forEach((node) => {
    node.textContent = fmtRest(remaining);
  });
  document.querySelectorAll("[data-rest-bar]").forEach((node) => {
    node.style.width = `${pct}%`;
  });
  document.querySelectorAll("[data-rest-toggle]").forEach((node) => {
    node.disabled = running;
  });
  const hint = running
    ? restState.label
      ? t("Đang nghỉ · {label}", { label: restState.label })
      : t("Đang nghỉ")
    : restState.completed
      ? restState.label
        ? t("Hết giờ · {label}", { label: restState.label })
        : t("Hết giờ")
      : t("Sẵn sàng");
  document.querySelectorAll("[data-rest-hint]").forEach((node) => {
    node.textContent = hint;
  });
}

function stopRestTimer({ completed = false } = {}) {
  if (restState.timerId) {
    clearInterval(restState.timerId);
    restState.timerId = null;
  }
  restState.endAt = null;
  restState.completed = completed;
  if (completed) renderRestUi(0, restState.duration, false);
  else renderRestUi(restState.duration, restState.duration, false);
}

/* --- âm thanh hết giờ (Web Audio, không cần file mp3) --- */

function ensureAudio() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    audioCtx = new Ctx();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

function unlockAudio() {
  const ctx = ensureAudio();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}

function playRestChime() {
  if (!restSoundOn) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const start = () => {
    const now = ctx.currentTime + 0.02;
    [0, 0.28, 0.56].forEach((offset, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = index === 2 ? 1174.66 : 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.22);
    });
  };
  if (ctx.state === "suspended") ctx.resume().then(start).catch(() => {});
  else start();
}

function vibrateRest() {
  if (!restVibrateOn || !navigator.vibrate) return;
  try {
    navigator.vibrate([200, 100, 200, 100, 300]);
  } catch {
    /* ignore */
  }
}

/* --- thông báo khi tab ở nền --- */

function notificationsSupported() {
  return "Notification" in window;
}

function updateNotifyButton() {
  const button = $("#restNotifyBtn");
  if (!button) return;
  if (!notificationsSupported()) {
    button.textContent = t("🔕 Không hỗ trợ");
    button.disabled = true;
    return;
  }
  if (Notification.permission === "granted") {
    button.textContent = t("🔔 Đã bật thông báo");
    button.disabled = false;
    button.title = t("Gửi thử một thông báo");
  } else if (Notification.permission === "denied") {
    button.textContent = t("🔕 Thông báo bị chặn");
    button.disabled = true;
    button.title = t("Mở khoá thông báo trong cài đặt trình duyệt");
  } else {
    button.textContent = t("🔔 Bật thông báo");
    button.disabled = false;
    button.title = t("Bật thông báo khi tab ở nền");
  }
}

async function requestNotifyPermission() {
  if (!notificationsSupported()) return;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      /* ignore */
    }
  }
  updateNotifyButton();
}

async function showRestNotification(title, body, tag = "workout-rest") {
  if (!notificationsSupported() || Notification.permission !== "granted") return false;
  const options = {
    body,
    tag,
    renotify: true,
    icon: "/static/icon-192.png",
    badge: "/static/icon-192.png",
    vibrate: [200, 100, 200],
  };
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(title, options);
        return true;
      }
    }
    const note = new Notification(title, options);
    note.onclick = () => {
      window.focus();
      note.close();
    };
    return true;
  } catch {
    return false;
  }
}

function notifyRestDone(label) {
  if (!document.hidden) return;
  const body = label ? t("{label} — lên tập tiếp theo!", { label }) : t("Lên tập tiếp theo!");
  showRestNotification(t("Hết giờ nghỉ 💪"), body);
}

function prepareRestAlerts() {
  unlockAudio();
  if (notificationsSupported() && Notification.permission === "default") {
    requestNotifyPermission();
  }
}

function completeRestTimer() {
  const label = restState.label;
  stopRestTimer({ completed: true });
  toast(label ? t("Hết giờ nghỉ · {label} — lên tập!", { label }) : t("Hết giờ nghỉ — lên tập tiếp theo!"));
  playRestChime();
  vibrateRest();
  notifyRestDone(label);
}

function tickRestTimer() {
  if (!restState.endAt) return;
  const remaining = Math.max(0, Math.ceil((restState.endAt - Date.now()) / 1000));
  if (remaining <= 0) {
    completeRestTimer();
    return;
  }
  renderRestUi(remaining, restState.duration, true);
}

function startRestTimer(seconds, label = "") {
  const duration = Math.max(
    1,
    Math.min(3600, Math.floor(Number(seconds) || restState.duration || REST_DEFAULT))
  );
  restState.duration = duration;
  restState.label = label || "";
  restState.completed = false;
  restState.endAt = Date.now() + duration * 1000;
  const custom = $("#restCustom");
  if (custom) custom.value = duration;
  renderRestUi(duration, duration, true);
  if (restState.timerId) clearInterval(restState.timerId);
  restState.timerId = setInterval(tickRestTimer, 250);
  return duration;
}

function initRest() {
  $("#restStartBtn").addEventListener("click", () => {
    if (restState.endAt) return;
    prepareRestAlerts();
    const custom = Number($("#restCustom").value);
    startRestTimer(custom > 0 ? custom : restState.duration);
  });
  $("#restStopBtn").addEventListener("click", () => stopRestTimer());
  $("#restPresets").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-rest-start]");
    if (btn) {
      prepareRestAlerts();
      startRestTimer(Number(btn.dataset.restStart));
    }
  });

  const soundToggle = $("#restSoundToggle");
  const vibrateToggle = $("#restVibrateToggle");
  soundToggle.checked = restSoundOn;
  vibrateToggle.checked = restVibrateOn;
  soundToggle.addEventListener("change", () => {
    restSoundOn = soundToggle.checked;
    storeBool(REST_SOUND_KEY, restSoundOn);
    if (restSoundOn) {
      unlockAudio();
      playRestChime();
    }
  });
  vibrateToggle.addEventListener("change", () => {
    restVibrateOn = vibrateToggle.checked;
    storeBool(REST_VIBRATE_KEY, restVibrateOn);
    if (restVibrateOn && navigator.vibrate) navigator.vibrate(80);
  });

  $("#restNotifyBtn").addEventListener("click", async () => {
    if (!notificationsSupported()) return;
    if (Notification.permission === "granted") {
      showRestNotification(t("Thông báo đã bật ✅"), t("Bạn sẽ được báo khi hết giờ nghỉ lúc tab ở nền."));
      toast(t("Đã gửi thử thông báo"));
      return;
    }
    await requestNotifyPermission();
    if (Notification.permission === "granted") toast(t("Đã bật thông báo khi tab nền"));
    else if (Notification.permission === "denied") toast(t("Trình duyệt đã chặn thông báo"));
  });
  updateNotifyButton();

  document.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });
  document.addEventListener("keydown", unlockAudio, { once: true });
  renderRestUi(restState.duration, restState.duration, false);
}

/* ---------- HIIT / cardio interval timer ---------- */

const HIIT_WORK_KEY = "workout-tracker-hiit-work";
const HIIT_REST_KEY = "workout-tracker-hiit-rest";
const HIIT_ROUNDS_KEY = "workout-tracker-hiit-rounds";
const HIIT_DEFAULTS = { work: 20, rest: 10, rounds: 8 };

const hiitState = {
  running: false,
  completed: false,
  phase: "work",
  round: 1,
  rounds: HIIT_DEFAULTS.rounds,
  workSec: HIIT_DEFAULTS.work,
  restSec: HIIT_DEFAULTS.rest,
  phaseDuration: HIIT_DEFAULTS.work,
  phaseEndAt: 0,
  timerId: null,
};

function clampWhole(value, min, max, fallback) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function readStoredInt(key, fallback, min, max) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : clampWhole(raw, min, max, fallback);
  } catch {
    return fallback;
  }
}

function storeInt(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

function hiitInputValues() {
  return {
    work: clampWhole($("#hiitWork")?.value, 1, 3600, HIIT_DEFAULTS.work),
    rest: clampWhole($("#hiitRest")?.value, 0, 3600, HIIT_DEFAULTS.rest),
    rounds: clampWhole($("#hiitRounds")?.value, 1, 99, HIIT_DEFAULTS.rounds),
  };
}

function persistHiitValues(values = hiitInputValues()) {
  storeInt(HIIT_WORK_KEY, values.work);
  storeInt(HIIT_REST_KEY, values.rest);
  storeInt(HIIT_ROUNDS_KEY, values.rounds);
}

function hiitTotalSeconds(work, rest, rounds) {
  return work * rounds + rest * Math.max(0, rounds - 1);
}

function fmtHiitDuration(total) {
  const whole = Math.max(0, Math.round(total));
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  if (!minutes) return t("{n} giây", { n: seconds });
  return seconds
    ? t("{m} phút {s} giây", { m: minutes, s: seconds })
    : t("{n} phút", { n: minutes });
}

function updateHiitTotal() {
  const node = $("#hiitTotal");
  if (!node) return;
  const values = hiitState.running
    ? { work: hiitState.workSec, rest: hiitState.restSec, rounds: hiitState.rounds }
    : hiitInputValues();
  node.textContent = t("Tổng ~{duration} · {n} hiệp", {
    duration: fmtHiitDuration(hiitTotalSeconds(values.work, values.rest, values.rounds)),
    n: values.rounds,
  });
}

function renderHiit(remaining, running) {
  const panel = $("#hiitPanel");
  if (!panel) return;
  const statePhase = running ? hiitState.phase : hiitState.completed ? "done" : "idle";
  panel.dataset.phase = statePhase;
  const values = hiitInputValues();
  const rounds = hiitState.running || hiitState.completed ? hiitState.rounds : values.rounds;
  const round = hiitState.round;

  const phaseNode = $("#hiitPhase");
  if (phaseNode) {
    if (statePhase === "done") phaseNode.textContent = t("HOÀN THÀNH · {n} HIỆP", { n: hiitState.rounds });
    else if (statePhase === "work") phaseNode.textContent = t("HIỆP {r}/{n}", { r: round, n: rounds });
    else if (statePhase === "rest") phaseNode.textContent = t("NGHỈ · HIỆP {r}/{n}", { r: round, n: rounds });
    else phaseNode.textContent = t("HIỆP 1/{n}", { n: rounds });
  }

  const timeNode = $("#hiitTime");
  if (timeNode) {
    timeNode.textContent = fmtRest(statePhase === "idle" ? values.work : Math.max(0, remaining));
  }
  const unitNode = $("#hiitUnit");
  if (unitNode) {
    unitNode.textContent = statePhase === "rest" ? t("nghỉ") : statePhase === "done" ? t("xong") : t("tập");
  }

  const duration =
    statePhase === "idle" ? Math.max(1, values.work) : Math.max(1, hiitState.phaseDuration);
  const pct =
    statePhase === "idle"
      ? 100
      : Math.max(0, Math.min(100, (Math.max(0, remaining) / duration) * 100));
  document.querySelectorAll("[data-hiit-bar]").forEach((node) => {
    node.style.width = `${pct}%`;
  });

  const hint = $("#hiitHint");
  if (hint) {
    if (statePhase === "work") hint.textContent = t("Hiệp {r}/{n} · tập", { r: round, n: rounds });
    else if (statePhase === "rest") hint.textContent = t("Nghỉ trước hiệp {n}", { n: round + 1 });
    else if (statePhase === "done") hint.textContent = t("Xong · bấm Làm lại để tập tiếp");
    else hint.textContent = t("Sẵn sàng");
  }

  const startBtn = $("#hiitStartBtn");
  if (startBtn) {
    startBtn.disabled = running;
    startBtn.textContent = running ? t("Đang chạy") : hiitState.completed ? t("Làm lại") : t("Bắt đầu");
  }
  ["#hiitWork", "#hiitRest", "#hiitRounds"].forEach((selector) => {
    const input = $(selector);
    if (input) input.disabled = running;
  });
  updateHiitTotal();
}

function announceHiitPhase() {
  if (hiitState.phase === "work") {
    toast(t("Hiệp {r}/{n} — tập!", { r: hiitState.round, n: hiitState.rounds }));
    if (document.hidden) {
      showRestNotification(
        t("Bắt đầu hiệp 💪"),
        `${hiitState.round}/${hiitState.rounds} · ${hiitState.workSec}s`,
        "workout-hiit"
      );
    }
  } else {
    toast(t("Nghỉ {rest}s · hiệp {r}/{n}", {
      rest: hiitState.restSec,
      r: hiitState.round,
      n: hiitState.rounds,
    }));
    if (document.hidden) {
      showRestNotification(
        t("Nghỉ giữa hiệp"),
        `${hiitState.restSec}s · ${hiitState.round}/${hiitState.rounds}`,
        "workout-hiit"
      );
    }
  }
  playRestChime();
  vibrateRest();
}

function stopHiit({ completed = false, silent = false } = {}) {
  if (hiitState.timerId) {
    clearInterval(hiitState.timerId);
    hiitState.timerId = null;
  }
  hiitState.running = false;
  hiitState.phaseEndAt = 0;
  hiitState.completed = completed;
  if (!completed) {
    hiitState.round = 1;
    hiitState.phase = "work";
    hiitState.phaseDuration = hiitState.workSec;
  }
  if (!focusOpen) releaseWakeLock();
  if (silent) return;
  renderHiit(hiitState.workSec, false);
  if (!completed) toast(t("Đã dừng HIIT"));
}

function finishHiit() {
  const rounds = hiitState.rounds;
  stopHiit({ completed: true, silent: true });
  renderHiit(0, false);
  toast(t("Hoàn thành HIIT · {n} hiệp 🎉", { n: rounds }));
  playRestChime();
  vibrateRest();
  if (document.hidden) {
    showRestNotification(
      t("Hoàn thành HIIT 🎉"),
      t("{n} hiệp xong — nghỉ ngơi thôi!", { n: rounds }),
      "workout-hiit"
    );
  }
}

function tickHiitTimer() {
  if (!hiitState.running) return;
  const now = Date.now();
  if (now < hiitState.phaseEndAt) {
    renderHiit(Math.ceil((hiitState.phaseEndAt - now) / 1000), true);
    return;
  }

  let transitioned = false;
  let guard = 0;
  while (hiitState.running && hiitState.phaseEndAt <= now && guard < 500) {
    guard += 1;
    transitioned = true;
    if (hiitState.phase === "work") {
      if (hiitState.round >= hiitState.rounds) {
        finishHiit();
        return;
      }
      if (hiitState.restSec > 0) {
        hiitState.phase = "rest";
        hiitState.phaseDuration = hiitState.restSec;
        hiitState.phaseEndAt += hiitState.restSec * 1000;
      } else {
        hiitState.round += 1;
        hiitState.phaseDuration = hiitState.workSec;
        hiitState.phaseEndAt += hiitState.workSec * 1000;
      }
    } else {
      hiitState.round += 1;
      hiitState.phase = "work";
      hiitState.phaseDuration = hiitState.workSec;
      hiitState.phaseEndAt += hiitState.workSec * 1000;
    }
  }

  if (transitioned) announceHiitPhase();
  const remaining = Math.max(0, Math.ceil((hiitState.phaseEndAt - Date.now()) / 1000));
  renderHiit(remaining, true);
}

function startHiit() {
  const values = hiitInputValues();
  hiitState.workSec = values.work;
  hiitState.restSec = values.rest;
  hiitState.rounds = values.rounds;
  hiitState.round = 1;
  hiitState.phase = "work";
  hiitState.phaseDuration = values.work;
  hiitState.completed = false;
  hiitState.running = true;
  hiitState.phaseEndAt = Date.now() + values.work * 1000;
  persistHiitValues(values);

  if (restState.endAt) stopRestTimer();
  if (hiitState.timerId) clearInterval(hiitState.timerId);
  hiitState.timerId = setInterval(tickHiitTimer, 250);
  renderHiit(values.work, true);
  prepareRestAlerts();
  unlockAudio();
  if (!focusOpen) requestWakeLock();
  toast(t("HIIT bắt đầu · {rounds} hiệp · {work}s tập / {rest}s nghỉ", {
    rounds: values.rounds,
    work: values.work,
    rest: values.rest,
  }));
}

function initHiit() {
  if (!$("#hiitPanel")) return;
  const stored = {
    work: readStoredInt(HIIT_WORK_KEY, HIIT_DEFAULTS.work, 1, 3600),
    rest: readStoredInt(HIIT_REST_KEY, HIIT_DEFAULTS.rest, 0, 3600),
    rounds: readStoredInt(HIIT_ROUNDS_KEY, HIIT_DEFAULTS.rounds, 1, 99),
  };
  $("#hiitWork").value = stored.work;
  $("#hiitRest").value = stored.rest;
  $("#hiitRounds").value = stored.rounds;
  hiitState.workSec = stored.work;
  hiitState.restSec = stored.rest;
  hiitState.rounds = stored.rounds;
  hiitState.phaseDuration = stored.work;

  $("#hiitStartBtn").addEventListener("click", () => {
    if (!hiitState.running) startHiit();
  });
  $("#hiitStopBtn").addEventListener("click", () => stopHiit());

  $("#hiitPresets").addEventListener("click", (event) => {
    const button = event.target.closest("[data-hiit-preset]");
    if (!button) return;
    if (hiitState.running) {
      toast("Dừng HIIT trước khi đổi bài");
      return;
    }
    const [work, rest, rounds] = button.dataset.hiitPreset.split(",").map(Number);
    const values = {
      work: clampWhole(work, 1, 3600, HIIT_DEFAULTS.work),
      rest: clampWhole(rest, 0, 3600, HIIT_DEFAULTS.rest),
      rounds: clampWhole(rounds, 1, 99, HIIT_DEFAULTS.rounds),
    };
    $("#hiitWork").value = values.work;
    $("#hiitRest").value = values.rest;
    $("#hiitRounds").value = values.rounds;
    hiitState.workSec = values.work;
    hiitState.restSec = values.rest;
    hiitState.rounds = values.rounds;
    hiitState.phaseDuration = values.work;
    hiitState.completed = false;
    persistHiitValues(values);
    renderHiit(values.work, false);
  });

  ["#hiitWork", "#hiitRest", "#hiitRounds"].forEach((selector) => {
    const input = $(selector);
    input.addEventListener("input", () => {
      if (hiitState.running) return;
      hiitState.completed = false;
      updateHiitTotal();
    });
    input.addEventListener("change", () => {
      if (hiitState.running) return;
      const values = hiitInputValues();
      $("#hiitWork").value = values.work;
      $("#hiitRest").value = values.rest;
      $("#hiitRounds").value = values.rounds;
      hiitState.workSec = values.work;
      hiitState.restSec = values.rest;
      hiitState.rounds = values.rounds;
      hiitState.phaseDuration = values.work;
      hiitState.completed = false;
      persistHiitValues(values);
      renderHiit(values.work, false);
    });
  });

  renderHiit(stored.work, false);
}

const THEME_KEY = "workout-tracker-theme";

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const toggle = $("#themeToggle");
  if (toggle) {
    toggle.textContent = theme === "dark" ? "☀️" : "🌙";
    toggle.setAttribute("aria-label", theme === "dark" ? t("Chế độ sáng") : t("Chế độ tối"));
    toggle.title = theme === "dark" ? t("Chế độ sáng") : t("Chế độ tối");
  }
}

function initTheme() {
  let theme = "light";
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") theme = saved;
    else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) theme = "dark";
  } catch {
    theme = "light";
  }
  applyTheme(theme);
  $("#themeToggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
    applyTheme(next);
  });
}

async function saveTextFile(filename, text, mime = "application/json") {
  if (window.WTLocal?.saveFile) {
    await window.WTLocal.saveFile(filename, text, mime);
    return;
  }
  const file = new File([text], filename, { type: mime });
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
  if (mobile && navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch {
      /* người dùng huỷ hoặc trình duyệt không hỗ trợ */
    }
  }
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function initData() {
  const exportBtn = $("#exportBtn");
  const importBtn = $("#importBtn");
  const importFile = $("#importFile");
  const importText = $("#importText");
  const importSubmit = $("#importSubmit");

  exportBtn.addEventListener("click", async () => {
    const payload = await api("/api/export");
    const data = { ...payload };
    delete data.ok;
    await saveTextFile(
      `workout-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(data, null, 2)
    );
    toast("Đã xuất dữ liệu");
  });

  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", async () => {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    importText.value = await file.text();
  });

  importSubmit.addEventListener("click", async () => {
    const text = importText.value.trim();
    if (!text) {
      toast("Chọn file hoặc dán JSON trước");
      return;
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      toast("JSON không hợp lệ");
      return;
    }
    try {
      await api("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast("Đã nhập dữ liệu");
      await load();
    } catch (error) {
      toast(error.message);
    }
  });

  $("#backupNowBtn").addEventListener("click", async () => {
    try {
      await post("/api/backup/create", {});
      toast(t("Đã tạo bản sao lưu"));
      await load();
    } catch (error) {
      toast(error.message);
    }
  });

  $("#backupList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-backup-restore]");
    if (!button) return;
    const name = button.dataset.backupRestore;
    const label = formatBackupName(name);
    if (
      !confirmText(
        t("Khôi phục dữ liệu từ {label}? Dữ liệu hiện tại sẽ được thay bằng bản này. App tự sao lưu trước khi khôi phục.", { label })
      )
    ) {
      return;
    }
    try {
      await post("/api/backup/restore", { name });
      toast(t("Đã khôi phục dữ liệu"));
      await load();
    } catch (error) {
      toast(error.message);
    }
  });
}

function initTabs() {
  $("#monthTabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-month]");
    if (!tab) return;
    state.month = Number(tab.dataset.month);
    $("#monthSelect").value = String(state.month);
    load().catch((error) => toast(error.message));
  });
}

function initLifetime() {
  // Bản local-first không có server: bỏ qua kênh SSE.
  if (window.WTLocal) return;
  if (!window.EventSource) return;
  const source = new EventSource("/api/events");
  source.onerror = () => {
    // EventSource tự thử lại; không cần làm gì.
  };
}

function initPwa() {
  // Chỉ đăng ký service worker cho bản web/PWA (không đăng ký trong Vite dev).
  if (window.WTLocal && window.WTLocal.platform !== "web") return;
  if (location.port === "5173") return;
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Bỏ qua nếu trình duyệt không hỗ trợ.
    });
  });
}

/* ---------- cài app trên điện thoại (PWA) ---------- */

let installPromptEvent = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPromptEvent = event;
  const button = document.querySelector("#mobileInstall");
  if (button) button.hidden = false;
});

window.addEventListener("appinstalled", () => {
  installPromptEvent = null;
  const button = document.querySelector("#mobileInstall");
  if (button) button.hidden = true;
  toast("Đã cài app lên màn hình chính");
});

function isStandaloneApp() {
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true
  );
}

function mobilePlatform() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

function appBaseUrl() {
  return new URL("./", location.href).href;
}

async function copyMobileUrl() {
  const url = appBaseUrl();
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const node = document.querySelector("#mobileUrl");
    if (node) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      selection.removeAllRanges();
    }
  }
  toast("Đã sao chép link");
}

function initMobile() {
  const card = $("#mobileCard");
  if (!card) return;
  // App cài sẵn trên điện thoại/desktop: không cần hướng dẫn cài PWA.
  if (window.WTLocal && window.WTLocal.platform !== "web") {
    card.hidden = true;
    return;
  }
  const urlNode = $("#mobileUrl");
  if (urlNode) urlNode.textContent = appBaseUrl();

  const standalone = isStandaloneApp();
  const platform = mobilePlatform();
  const hint = $("#mobileHint");
  const status = $("#mobileStatus");
  const steps = $("#mobileSteps");
  const note = $("#mobileNote");

  if (hint) hint.textContent = standalone ? t("đang chạy như app") : t("PWA cho Android & iOS");
  if (status) {
    status.textContent = standalone
      ? t("App đang chạy từ màn hình chính; dữ liệu lưu riêng trên máy này.")
      : t("Mở link bên dưới trên điện thoại rồi cài vào màn hình chính để dùng như app.");
  }

  const iosSteps = [
    t("Mở link bằng <strong>Safari</strong> (không dùng trình duyệt trong Facebook/Zalo)."),
    t("Bấm nút <strong>Chia sẻ</strong> (□↑) ở thanh dưới."),
    t("Chọn <strong>Thêm vào Màn hình chính</strong> → <strong>Thêm</strong>."),
    t("Mở app từ icon; dữ liệu được lưu trên chính máy này."),
  ];
  const androidSteps = [
    t("Mở link bằng <strong>Chrome</strong>."),
    t("Bấm menu <strong>⋮</strong> → <strong>Cài đặt ứng dụng</strong> (hoặc Thêm vào Màn hình chính)."),
    t("Xác nhận <strong>Cài đặt</strong>."),
    t("Mở app từ icon; dữ liệu được lưu trên chính máy này."),
  ];
  const desktopSteps = [
    t("Mở link này trên điện thoại."),
    t("iPhone: Safari → Chia sẻ → Thêm vào Màn hình chính."),
    t("Android: Chrome → menu ⋮ → Cài đặt ứng dụng."),
  ];
  const list =
    platform === "ios" ? iosSteps : platform === "android" ? androidSteps : desktopSteps;
  if (steps) steps.innerHTML = list.map((text) => `<li>${text}</li>`).join("");

  if (note) {
    const local = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
    note.textContent = local
      ? t("Điện thoại không mở được 127.0.0.1. Hãy dùng bản cài Android/iOS hoặc đưa PWA lên một URL HTTPS.")
      : t("Bản PWA lưu dữ liệu trong trình duyệt của máy này. Dùng Xuất/Nhập JSON để sao lưu hoặc chuyển máy.");
  }

  $("#mobileCopy")?.addEventListener("click", copyMobileUrl);

  const installButton = $("#mobileInstall");
  if (installButton) {
    installButton.addEventListener("click", async () => {
      if (!installPromptEvent) return;
      installPromptEvent.prompt();
      try {
        await installPromptEvent.userChoice;
      } catch {
        /* ignore */
      }
      installPromptEvent = null;
      installButton.hidden = true;
    });
  }
}

function initShare() {
  $("#shareBtn").addEventListener("click", async () => {
    const month = String(state.month).padStart(2, "0");
    if (window.WTLocal) {
      try {
        const payload = await api(`/api/state?year=${state.year}&month=${state.month}`);
        await saveTextFile(
          `workout-tracker-${state.year}-${month}.json`,
          JSON.stringify(payload.state, null, 2)
        );
        toast("Đã xuất dữ liệu tháng này");
      } catch (error) {
        toast(error.message);
      }
      return;
    }
    window.open(`${location.origin}/shared/${state.year}-${month}`, "_blank");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initSelectors();
  initGrid();
  initRoutines();
  initFocusMode();
  initTodayView();
  initUnits();
  initAddHabit();
  initWellness();
  initNotes();
  initWorkout();
  initRest();
  initHiit();
  initData();
  initTheme();
  initPwa();
  initMobile();
  initShare();
  initTabs();
  initLifetime();
  load().catch((error) => toast(error.message));
});
