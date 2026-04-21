import { supabase } from "../../config/supabase.js";
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

const REPORTS_BUCKET = process.env.SUPABASE_REPORTS_BUCKET || 'reports';

// ─── Table config: mirrors the frontend getTableConfig ───────────────────────
function getReportConfig(reportType, content) {
  switch (reportType) {
    case 'Parent Report': {
      const rows = content.users || [];
      const columns = ['Name', 'Email', 'Account Status', 'Gender', 'Language', 'Join Date'];
      const getData = (r) => [
        `${r.fname} ${r.lname}`,
        r.email || '—',
        r.account_status || '—',
        r.gender || '—',
        r.default_language || '—',
        r.join_date ? String(r.join_date).split('T')[0] : '—',
      ];
      return { columns, rows, getData };
    }
    case 'Kid Profile Report': {
      const rows = content.kids || [];
      const columns = ['Name', 'Age', 'Grade', 'Medium', 'Parent'];
      const getData = (r) => [
        `${r.fname} ${r.lname}`,
        r.age ?? '—',
        r.grade || '—',
        r.medium || '—',
        r.user ? `${r.user.fname} ${r.user.lname}` : '—',
      ];
      return { columns, rows, getData };
    }
    case 'Quiz Performance Report': {
      const rows = content.quiz_attempts || [];
      const columns = ['Kid', 'Quiz Title', 'Subject', 'Score', 'Status', 'Attempts'];
      const getData = (r) => [
        r.kid_profile ? `${r.kid_profile.fname} ${r.kid_profile.lname}` : '—',
        r.quiz?.title || '—',
        r.quiz?.subject || '—',
        r.score ?? '—',
        r.completion_status || '—',
        r.attempt_count ?? '—',
      ];
      return { columns, rows, getData };
    }
    case 'Game Performance Report': {
      const rows = content.game_sessions || [];
      const columns = ['Kid', 'Game Title', 'Subject', 'Score', 'Attempts', 'Play Date'];
      const getData = (r) => [
        r.kid_profile ? `${r.kid_profile.fname} ${r.kid_profile.lname}` : '—',
        r.game?.title || '—',
        r.game?.subject || '—',
        r.score ?? '—',
        r.attempts ?? '—',
        r.play_date || '—',
      ];
      return { columns, rows, getData };
    }
    case 'Progress Report': {
      const rows = content.progress_records || [];
      const columns = ['Kid', 'Grade', 'Total Quizzes', 'Total Games', 'Score', 'Last Updated'];
      const getData = (r) => [
        r.kid_profile ? `${r.kid_profile.fname} ${r.kid_profile.lname}` : '—',
        r.kid_profile?.grade || '—',
        r.total_quizzes ?? '—',
        r.total_games ?? '—',
        r.score ?? '—',
        r.last_updated ? String(r.last_updated).split('T')[0] : '—',
      ];
      return { columns, rows, getData };
    }
    case 'Subscription Report': {
      const rows = content.subscriptions || [];
      const columns = ['User', 'Billing Period', 'Amount', 'Payment Status', 'Start Date', 'Renewal Date'];
      const getData = (r) => [
        r.user ? `${r.user.fname} ${r.user.lname}` : '—',
        r.billing_period || '—',
        r.total_amount != null ? `LKR ${r.total_amount}` : '—',
        r.payment_status || '—',
        r.subscribed_date || '—',
        r.renewal_date || '—',
      ];
      return { columns, rows, getData };
    }
    case 'Transaction Report': {
      const rows = content.transactions || [];
      const columns = ['Transaction ID', 'Amount', 'Method', 'Status', 'Date'];
      const getData = (r) => [
        r.transaction_id || '—',
        r.amount != null ? `LKR ${r.amount}` : '—',
        r.method || '—',
        r.status || '—',
        r.transaction_date || '—',
      ];
      return { columns, rows, getData };
    }
    case 'Timer / Screen Time Report': {
      const rows = content.timer_sessions || [];
      const columns = ['Kid', 'Start Time', 'End Time', 'Total Time (min)', 'Status'];
      const getData = (r) => [
        r.kid_profile ? `${r.kid_profile.fname} ${r.kid_profile.lname}` : '—',
        r.start_time ? String(r.start_time).replace('T', ' ').split('.')[0] : '—',
        r.end_time ? String(r.end_time).replace('T', ' ').split('.')[0] : '—',
        r.total_time != null ? Math.round(Number(r.total_time) / 60) : '—',
        r.status || '—',
      ];
      return { columns, rows, getData };
    }
    case 'Certificate Report': {
      const rows = content.certificates || [];
      const columns = ['Certificate ID', 'Kid', 'Issue Date', 'Status'];
      const getData = (r) => {
        const k = r.progress?.kid_profile;
        return [
          r.certificate_id || '—',
          k ? `${k.fname} ${k.lname}` : '—',
          r.issue_date || '—',
          r.status || '—',
        ];
      };
      return { columns, rows, getData };
    }
    case 'Content Upload Report': {
      const rows = content.content_items || [];
      const columns = ['Title', 'Type', 'Subject', 'Grade', 'Language', 'Access Type', 'Uploaded Date'];
      const getData = (r) => [
        r.title || '—',
        r._type || '—',
        r.subject || '—',
        r.grade || '—',
        r.language || '—',
        r.access_type || '—',
        r.uploaded_date || '—',
      ];
      return { columns, rows, getData };
    }
    default:
      return { columns: [], rows: [], getData: () => [] };
  }
}

// ─── File builders ────────────────────────────────────────────────────────────
function buildCSVBuffer(columns, rows, getData) {
  const header = columns.join(',');
  const body = rows
    .map(r => getData(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  return Buffer.from(`${header}\n${body}`, 'utf-8');
}

function buildExcelBuffer(reportName, columns, rows, getData) {
  const wsData = [columns, ...rows.map(r => getData(r))];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, reportName.substring(0, 31));
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

// ─── PDF color / style constants ─────────────────────────────────────────────
const PDF = {
  brand:      '#4F46E5', // indigo-600
  brandDark:  '#3730A3', // indigo-800
  headerText: '#FFFFFF',
  rowAlt:     '#F5F3FF', // indigo-50
  rowEven:    '#FFFFFF',
  border:     '#C7D2FE', // indigo-200
  textDark:   '#1E1B4B', // indigo-950
  textMid:    '#4B5563', // gray-600
  textLight:  '#9CA3AF', // gray-400
  accent:     '#818CF8', // indigo-400
  margin:     40,
  rowH:       20,
  headerH:    24,
  footerH:    24,
};

function buildPDFBuffer(reportName, reportType, columns, rows, getData) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: PDF.margin,
      autoFirstPage: false,
      info: {
        Title: reportName,
        Author: 'EduKid Platform',
        Subject: reportType,
        CreationDate: new Date(),
      },
    });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Column widths (distribute usable width proportionally) ──────────────
    const pageW  = 841.89;   // A4 landscape pt
    const usable = pageW - PDF.margin * 2;
    const colW   = columns.length > 0 ? Math.floor(usable / columns.length) : usable;
    const colWidths = columns.map(() => colW);
    // give the last column the remainder to avoid rounding gaps
    if (columns.length > 0) colWidths[columns.length - 1] += usable - colW * columns.length;

    // ── Page helpers ─────────────────────────────────────────────────────────
    let pageNum = 0;
    const totalPages = () => Math.max(1, Math.ceil(rows.length / rowsPerPage()) + (rows.length === 0 ? 1 : 0));

    function rowsPerPage() {
      const contentH = 595.28 - PDF.margin * 2 - 80 - PDF.footerH - PDF.headerH * 2;
      return Math.floor(contentH / PDF.rowH) || 1;
    }

    function addPage() {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: PDF.margin });
      pageNum++;
      drawPageHeader();
      drawFooter();
    }

    // ── Branded page header ───────────────────────────────────────────────────
    function drawPageHeader() {
      const top = PDF.margin;
      const W   = pageW - PDF.margin * 2;

      // Background bar
      doc.rect(PDF.margin, top, W, 50).fill(PDF.brand);

      // App name (left)
      doc.fillColor(PDF.headerText).font('Helvetica-Bold').fontSize(18)
        .text('EduKid', PDF.margin + 12, top + 8, { width: 120 });
      doc.fillColor(PDF.accent).font('Helvetica').fontSize(9)
        .text('Educational Platform', PDF.margin + 12, top + 28, { width: 150 });

      // Report title (centre)
      doc.fillColor(PDF.headerText).font('Helvetica-Bold').fontSize(15)
        .text(reportName, PDF.margin, top + 11, { width: W, align: 'center' });

      // Report type tag (right)
      const tagW = 160;
      doc.fillColor(PDF.accent).font('Helvetica').fontSize(8)
        .text(reportType, pageW - PDF.margin - tagW - 4, top + 10, { width: tagW, align: 'right' });
      doc.fillColor('#C7D2FE').font('Helvetica').fontSize(8)
        .text(`Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
          pageW - PDF.margin - tagW - 4, top + 24, { width: tagW, align: 'right' });
      doc.fillColor(PDF.headerText).font('Helvetica').fontSize(8)
        .text(`Total records: ${rows.length}`,
          pageW - PDF.margin - tagW - 4, top + 38, { width: tagW, align: 'right' });
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    function drawFooter() {
      const y = 595.28 - PDF.margin - PDF.footerH + 6;
      doc.moveTo(PDF.margin, y - 4).lineTo(pageW - PDF.margin, y - 4)
        .strokeColor(PDF.border).lineWidth(0.5).stroke();
      doc.fillColor(PDF.textLight).font('Helvetica').fontSize(7.5)
        .text('© EduKid Platform — Confidential', PDF.margin, y, { width: 200 })
        .text(`Page ${pageNum}`, PDF.margin, y, { width: pageW - PDF.margin * 2, align: 'right' });
    }

    // ── Table column header row ───────────────────────────────────────────────
    function drawTableHeader(y) {
      // Header background
      doc.rect(PDF.margin, y, pageW - PDF.margin * 2, PDF.headerH).fill(PDF.brandDark);

      let x = PDF.margin;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF.headerText);
      columns.forEach((col, i) => {
        doc.text(col.toUpperCase(), x + 5, y + 7, {
          width: colWidths[i] - 10,
          ellipsis: true,
          lineBreak: false,
        });
        // Vertical divider
        if (i < columns.length - 1) {
          doc.moveTo(x + colWidths[i], y + 4)
            .lineTo(x + colWidths[i], y + PDF.headerH - 4)
            .strokeColor('#6366F1').lineWidth(0.6).stroke();
        }
        x += colWidths[i];
      });
      return y + PDF.headerH;
    }

    // ── Single data row ───────────────────────────────────────────────────────
    function drawDataRow(y, cells, isAlt) {
      const W = pageW - PDF.margin * 2;
      // Row background
      doc.rect(PDF.margin, y, W, PDF.rowH).fill(isAlt ? PDF.rowAlt : PDF.rowEven);
      // Bottom rule
      doc.moveTo(PDF.margin, y + PDF.rowH).lineTo(PDF.margin + W, y + PDF.rowH)
        .strokeColor(PDF.border).lineWidth(0.4).stroke();

      let x = PDF.margin;
      doc.font('Helvetica').fontSize(8).fillColor(PDF.textDark);
      cells.forEach((val, i) => {
        const text = String(val ?? '—');
        // Highlight status-like values
        if (/^(paid|active|completed|passed)/i.test(text)) {
          doc.fillColor('#16A34A');
        } else if (/^(free|inactive|failed|pending)/i.test(text)) {
          doc.fillColor('#DC2626');
        } else {
          doc.fillColor(PDF.textDark);
        }
        doc.text(text, x + 5, y + 6, {
          width: colWidths[i] - 10,
          ellipsis: true,
          lineBreak: false,
        });
        // Vertical divider
        if (i < columns.length - 1) {
          doc.moveTo(x + colWidths[i], y + 3)
            .lineTo(x + colWidths[i], y + PDF.rowH - 3)
            .strokeColor(PDF.border).lineWidth(0.3).stroke();
        }
        x += colWidths[i];
      });
    }

    // ── Summary box ───────────────────────────────────────────────────────────
    function drawSummaryBox(y) {
      const boxH = 28;
      doc.rect(PDF.margin, y, pageW - PDF.margin * 2, boxH)
        .fill('#EEF2FF').stroke(PDF.border);
      doc.fillColor(PDF.textMid).font('Helvetica').fontSize(8)
        .text(`Report Type: ${reportType}`, PDF.margin + 10, y + 5)
        .text(`Total Records: ${rows.length}`, PDF.margin + 10, y + 15);
      doc.fillColor(PDF.textMid)
        .text(`Generated by EduKid on ${new Date().toLocaleString('en-GB')}`,
          PDF.margin, y + 10, { width: pageW - PDF.margin * 2 - 10, align: 'right' });
      return y + boxH + 6;
    }

    // ── Outer table border ────────────────────────────────────────────────────
    function drawTableBorder(startY, endY) {
      doc.rect(PDF.margin, startY, pageW - PDF.margin * 2, endY - startY)
        .strokeColor(PDF.border).lineWidth(0.8).stroke();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Build pages
    // ═════════════════════════════════════════════════════════════════════════
    addPage();

    const contentStartY = PDF.margin + 50 + 8; // below branded header
    let y = drawSummaryBox(contentStartY);

    if (rows.length === 0) {
      doc.rect(PDF.margin, y, pageW - PDF.margin * 2, 50).fill('#F9FAFB').stroke(PDF.border);
      doc.fillColor(PDF.textLight).font('Helvetica').fontSize(10)
        .text('No data available for the selected filters.', PDF.margin, y + 17, {
          width: pageW - PDF.margin * 2, align: 'center',
        });
    } else {
      const tableStartY = y;
      y = drawTableHeader(y);

      rows.forEach((row, idx) => {
        const bottomMargin = PDF.margin + PDF.footerH + 8;
        if (y + PDF.rowH > 595.28 - bottomMargin) {
          drawTableBorder(tableStartY, y);
          addPage();
          y = drawTableHeader(PDF.margin + 50 + 8);
        }
        drawDataRow(y, getData(row), idx % 2 === 1);
        y += PDF.rowH;
      });

      drawTableBorder(tableStartY, y);
    }

    doc.end();
  });
}

// ─── Supabase Storage helpers ─────────────────────────────────────────────────
async function ensureBucketExists() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === REPORTS_BUCKET);
  if (!exists) {
    await supabase.storage.createBucket(REPORTS_BUCKET, { public: true });
  }
}

async function uploadReportToStorage(fileBuffer, objectPath, contentType) {
  try {
    await ensureBucketExists();
  } catch {
    // bucket already exists or no permission to list — proceed
  }

  const { error } = await supabase.storage
    .from(REPORTS_BUCKET)
    .upload(objectPath, fileBuffer, { contentType, upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(REPORTS_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

// ─── Generate report ──────────────────────────────────────────────────────────
export const generateReport = async (req, res) => {
  try {
    const {
      report_type,
      report_name,
      filters,
      format = "csv",
    } = req.body;

    const user_id = req.user?.user_id;

    if (!report_type) {
      return res.status(400).json({ error: "Report type is required" });
    }

    // 1. Fetch report data
    let reportContent = {};

    const role = req.user?.role;

    switch (report_type) {
      case "Parent Report":
        reportContent = await generateParentReport(user_id, filters, role);
        break;
      case "Kid Profile Report":
        reportContent = await generateKidProfileReport(user_id, filters, role);
        break;
      case "Quiz Performance Report":
        reportContent = await generateQuizPerformanceReport(user_id, filters, role);
        break;
      case "Game Performance Report":
        reportContent = await generateGamePerformanceReport(user_id, filters, role);
        break;
      case "Progress Report":
        reportContent = await generateProgressReport(user_id, filters, role);
        break;
      case "Subscription Report":
        reportContent = await generateSubscriptionReport(user_id, filters, role);
        break;
      case "Transaction Report":
        reportContent = await generateTransactionReport(user_id, filters, role);
        break;
      case "Timer / Screen Time Report":
        reportContent = await generateTimerReport(user_id, filters, role);
        break;
      case "Certificate Report":
        reportContent = await generateCertificateReport(user_id, filters, role);
        break;
      case "Content Upload Report":
        reportContent = await generateContentUploadReport(filters);
        break;
      default:
        return res.status(400).json({ error: "Invalid report type" });
    }

    // 2. Build file buffer
    const safeReportName = (report_name || report_type).replace(/[^\w\s-]/g, '_');
    const { columns, rows, getData } = getReportConfig(report_type, reportContent);

    let fileBuffer, contentType, fileExt;
    if (format === 'excel') {
      fileBuffer = buildExcelBuffer(safeReportName, columns, rows, getData);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      fileExt = 'xlsx';
    } else if (format === 'pdf') {
      fileBuffer = await buildPDFBuffer(safeReportName, report_type, columns, rows, getData);
      contentType = 'application/pdf';
      fileExt = 'pdf';
    } else {
      fileBuffer = buildCSVBuffer(columns, rows, getData);
      contentType = 'text/csv';
      fileExt = 'csv';
    }

    // 3. Upload to Supabase Storage and get real public URL
    const report_id = `rpt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const objectPath = `${report_id}.${fileExt}`;
    const publicUrl = await uploadReportToStorage(fileBuffer, objectPath, contentType);

    // 4. Persist report record with real filepath
    const reportData = {
      report_id,
      report_type,
      filepath: publicUrl,
      date_generated: new Date().toISOString().split('T')[0],
      user_id: user_id || null,
    };

    const { data: report, error: reportError } = await supabase
      .from("report")
      .insert(reportData)
      .select()
      .single();

    if (reportError) throw reportError;

    res.json({
      message: "Report generated successfully",
      report: {
        ...report,
        content: reportContent,
      },
    });
  } catch (error) {
    console.error("Error generating report:", error);
    res.status(500).json({ error: error.message });
  }
};

// ─── Helper: get all kid_ids belonging to a user ─────────────────────────────
const getKidIdsForUser = async (user_id) => {
  const { data, error } = await supabase
    .from("kid_profile")
    .select("kid_id")
    .eq("user_id", user_id);
  if (error) throw error;
  return (data || []).map(k => k.kid_id);
};

// ─── Helper: get all subscription_ids belonging to a user ────────────────────
const getSubIdsForUser = async (user_id) => {
  const { data, error } = await supabase
    .from("subscription")
    .select("subscription_id")
    .eq("user_id", user_id);
  if (error) throw error;
  return (data || []).map(s => s.subscription_id);
};

// ─── Helper: get all progress_ids for a set of kid_ids ───────────────────────
const getProgressIdsForKids = async (kidIds) => {
  if (!kidIds.length) return [];
  const { data, error } = await supabase
    .from("progress")
    .select("progress_id")
    .in("kid_id", kidIds);
  if (error) throw error;
  return (data || []).map(p => p.progress_id);
};

// Helper functions for different report types
const generateParentReport = async (user_id, filters, role) => {
  // Admin sees all users; regular user sees only themselves
  let query = supabase
    .from("user")
    .select("user_id, fname, lname, email, gender, contact_number, join_date, default_language, account_status, address, role")
    .in("role", ["user", "User"]);

  if (role !== "admin" && role !== "Admin") {
    query = query.eq("user_id", user_id);
  }

  if (filters?.email) {
    query = query.ilike("email", `%${filters.email}%`);
  }
  if (filters?.account_status) {
    query = query.eq("account_status", filters.account_status);
  }
  if (filters?.gender) {
    query = query.eq("gender", filters.gender);
  }
  if (filters?.default_language) {
    query = query.eq("default_language", filters.default_language);
  }
  if (filters?.from_date) {
    query = query.gte("join_date", filters.from_date);
  }
  if (filters?.to_date) {
    query = query.lte("join_date", filters.to_date);
  }

  const { data, error } = await query;
  if (error) throw error;

  return { users: data || [], count: data?.length || 0 };
};

const generateKidProfileReport = async (user_id, filters, role) => {
  // Admin sees all kids; regular user sees only their own kids
  let query = supabase
    .from("kid_profile")
    .select("*, user:user_id(fname, lname, email)");

  if (role !== "admin" && role !== "Admin") {
    query = query.eq("user_id", user_id);
  }

  if (filters?.age_min) {
    query = query.gte("age", parseInt(filters.age_min));
  }
  if (filters?.age_max) {
    query = query.lte("age", parseInt(filters.age_max));
  }
  if (filters?.grade) {
    query = query.eq("grade", filters.grade);
  }
  if (filters?.from_date) {
    query = query.gte("created_date", filters.from_date);
  }
  if (filters?.to_date) {
    query = query.lte("created_date", filters.to_date);
  }

  const { data, error } = await query;
  if (error) throw error;

  return { kids: data || [], count: data?.length || 0 };
};

const generateQuizPerformanceReport = async (user_id, filters, role) => {
  // Step 1: resolve which kid_ids to filter by
  let kidIds = null;
  if (role !== "admin" && role !== "Admin") {
    kidIds = await getKidIdsForUser(user_id);
    if (!kidIds.length) return { quiz_attempts: [], count: 0 };
  }

  let query = supabase
    .from("kid_quiz")
    .select("*, quiz:quiz_id(title, subject, grade, access_type), kid_profile:kid_id(fname, lname, grade)");

  if (kidIds !== null) {
    query = query.in("kid_id", kidIds);
  }

  if (filters?.completion_status) {
    query = query.eq("completion_status", filters.completion_status);
  }
  if (filters?.score_min) {
    query = query.gte("score", parseInt(filters.score_min));
  }
  if (filters?.score_max) {
    query = query.lte("score", parseInt(filters.score_max));
  }
  if (filters?.from_date) {
    query = query.gte("start_time", filters.from_date);
  }
  if (filters?.to_date) {
    query = query.lte("start_time", filters.to_date);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Apply subject / access_type filter on joined quiz fields in-memory
  let rows = data || [];
  if (filters?.subject) {
    rows = rows.filter(r => r.quiz?.subject?.toLowerCase() === filters.subject.toLowerCase());
  }
  if (filters?.access_type) {
    rows = rows.filter(r => r.quiz?.access_type?.toLowerCase() === filters.access_type.toLowerCase());
  }

  return { quiz_attempts: rows, count: rows.length };
};

const generateGamePerformanceReport = async (user_id, filters, role) => {
  // Step 1: resolve kid_ids
  let kidIds = null;
  if (role !== "admin" && role !== "Admin") {
    kidIds = await getKidIdsForUser(user_id);
    if (!kidIds.length) return { game_sessions: [], count: 0 };
  }

  let query = supabase
    .from("kid_game")
    .select("*, game:game_id(title, subject, grade, access_type), kid_profile:kid_id(fname, lname, grade)");

  if (kidIds !== null) {
    query = query.in("kid_id", kidIds);
  }

  if (filters?.score_min) {
    query = query.gte("score", parseInt(filters.score_min));
  }
  if (filters?.score_max) {
    query = query.lte("score", parseInt(filters.score_max));
  }
  if (filters?.from_date) {
    query = query.gte("play_date", filters.from_date);
  }
  if (filters?.to_date) {
    query = query.lte("play_date", filters.to_date);
  }

  const { data, error } = await query;
  if (error) throw error;

  let rows = data || [];
  if (filters?.subject) {
    rows = rows.filter(r => r.game?.subject?.toLowerCase() === filters.subject.toLowerCase());
  }
  if (filters?.grade) {
    rows = rows.filter(r => r.game?.grade === filters.grade);
  }
  if (filters?.access_type) {
    rows = rows.filter(r => r.game?.access_type?.toLowerCase() === filters.access_type.toLowerCase());
  }

  return { game_sessions: rows, count: rows.length };
};

const generateProgressReport = async (user_id, filters, role) => {
  // Step 1: resolve kid_ids
  let kidIds = null;
  if (role !== "admin" && role !== "Admin") {
    kidIds = await getKidIdsForUser(user_id);
    if (!kidIds.length) return { progress_records: [], count: 0 };
  }

  let query = supabase
    .from("progress")
    .select("*, kid_profile:kid_id(fname, lname, age, grade, user_id)");

  if (kidIds !== null) {
    query = query.in("kid_id", kidIds);
  }

  if (filters?.score_min) {
    query = query.gte("score", parseFloat(filters.score_min));
  }
  if (filters?.score_max) {
    query = query.lte("score", parseFloat(filters.score_max));
  }
  if (filters?.from_date) {
    query = query.gte("last_updated", filters.from_date);
  }
  if (filters?.to_date) {
    query = query.lte("last_updated", filters.to_date);
  }

  const { data, error } = await query;
  if (error) throw error;

  let rows = data || [];
  if (filters?.grade) {
    rows = rows.filter(r => r.kid_profile?.grade === filters.grade);
  }

  return { progress_records: rows, count: rows.length };
};

const generateSubscriptionReport = async (user_id, filters, role) => {
  let query = supabase
    .from("subscription")
    .select("*, user:user_id(fname, lname, email)");

  // Admin can see all, regular users only their own
  if (role !== "admin" && role !== "Admin") {
    query = query.eq("user_id", user_id);
  }

  if (filters?.payment_status) {
    query = query.eq("payment_status", filters.payment_status);
  }
  if (filters?.from_date) {
    query = query.gte("subscribed_date", filters.from_date);
  }
  if (filters?.to_date) {
    query = query.lte("subscribed_date", filters.to_date);
  }

  const { data, error } = await query;
  if (error) throw error;

  return { subscriptions: data || [], count: data?.length || 0 };
};

const generateTransactionReport = async (user_id, filters, role) => {
  // Step 1: find subscription_ids for the user (unless admin)
  let subIds = null;
  if (role !== "admin" && role !== "Admin") {
    subIds = await getSubIdsForUser(user_id);
    if (!subIds.length) return { transactions: [], count: 0 };
  }

  let query = supabase
    .from("transaction")
    .select("*");

  if (subIds !== null) {
    query = query.in("subscription_id", subIds);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.method) {
    query = query.eq("method", filters.method);
  }
  if (filters?.from_date) {
    query = query.gte("transaction_date", filters.from_date);
  }
  if (filters?.to_date) {
    query = query.lte("transaction_date", filters.to_date);
  }

  const { data, error } = await query;
  if (error) throw error;

  return { transactions: data || [], count: data?.length || 0 };
};

const generateTimerReport = async (user_id, filters, role) => {
  // Step 1: resolve kid_ids (admin sees all)
  let kidIds = null;
  if (role !== "admin" && role !== "Admin") {
    kidIds = await getKidIdsForUser(user_id);
    if (!kidIds.length) return { timer_sessions: [], count: 0 };
  }

  let query = supabase
    .from("timer")
    .select("*, kid_profile:kid_id(fname, lname)");

  if (kidIds !== null) {
    query = query.in("kid_id", kidIds);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.from_date) {
    query = query.gte("start_time", filters.from_date);
  }
  if (filters?.to_date) {
    query = query.lte("start_time", filters.to_date);
  }

  const { data, error } = await query;
  if (error) throw error;

  let rows = data || [];
  // duration filters are in minutes; total_time is stored in seconds
  if (filters?.duration_min) {
    rows = rows.filter(r => r.total_time != null && r.total_time / 60 >= Number(filters.duration_min));
  }
  if (filters?.duration_max) {
    rows = rows.filter(r => r.total_time != null && r.total_time / 60 <= Number(filters.duration_max));
  }

  return { timer_sessions: rows, count: rows.length };
};

const generateCertificateReport = async (user_id, filters, role) => {
  // Step 1: resolve progress_ids via kid_ids (admin sees all)
  let progressIds = null;
  if (role !== "admin" && role !== "Admin") {
    const kidIds = await getKidIdsForUser(user_id);
    if (!kidIds.length) return { certificates: [], count: 0 };
    progressIds = await getProgressIdsForKids(kidIds);
    if (!progressIds.length) return { certificates: [], count: 0 };
  }

  let query = supabase
    .from("certificate")
    .select("*, progress:progress_id(progress_id, kid_profile:kid_id(fname, lname))");

  if (progressIds !== null) {
    query = query.in("progress_id", progressIds);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.certificate_id) {
    query = query.ilike("certificate_id", `%${filters.certificate_id}%`);
  }
  if (filters?.issue_date) {
    query = query.eq("issue_date", filters.issue_date);
  }
  if (filters?.from_date) {
    query = query.gte("issue_date", filters.from_date);
  }
  if (filters?.to_date) {
    query = query.lte("issue_date", filters.to_date);
  }

  const { data, error } = await query;
  if (error) throw error;

  return { certificates: data || [], count: data?.length || 0 };
};

const generateContentUploadReport = async (filters) => {
  // Fetch learning materials
  let matQuery = supabase
    .from("learning_materials")
    .select("material_id, title, subject, grade, language, access_type, uploaded_date");

  if (filters?.subject) {
    matQuery = matQuery.ilike("subject", `%${filters.subject}%`);
  }
  if (filters?.grade) {
    matQuery = matQuery.eq("grade", filters.grade);
  }
  if (filters?.access_type) {
    matQuery = matQuery.eq("access_type", filters.access_type);
  }
  if (filters?.from_date) {
    matQuery = matQuery.gte("uploaded_date", filters.from_date);
  }
  if (filters?.to_date) {
    matQuery = matQuery.lte("uploaded_date", filters.to_date);
  }

  // Fetch games
  let gameQuery = supabase
    .from("game")
    .select("game_id, title, subject, grade, language, access_type, uploaded_date");

  if (filters?.subject) {
    gameQuery = gameQuery.ilike("subject", `%${filters.subject}%`);
  }
  if (filters?.grade) {
    gameQuery = gameQuery.eq("grade", filters.grade);
  }
  if (filters?.access_type) {
    gameQuery = gameQuery.eq("access_type", filters.access_type);
  }
  if (filters?.from_date) {
    gameQuery = gameQuery.gte("uploaded_date", filters.from_date);
  }
  if (filters?.to_date) {
    gameQuery = gameQuery.lte("uploaded_date", filters.to_date);
  }

  const [{ data: materials, error: matErr }, { data: games, error: gameErr }] = await Promise.all([matQuery, gameQuery]);

  if (matErr) throw matErr;
  if (gameErr) throw gameErr;

  const items = [
    ...(materials || []).map(m => ({ ...m, _type: 'Material' })),
    ...(games || []).map(g => ({ ...g, _type: 'Game' })),
  ].sort((a, b) => (a.uploaded_date > b.uploaded_date ? -1 : 1));

  return { content_items: items, count: items.length };
};

// Get all reports
export const getReports = async (req, res) => {
  try {
    const user_id = req.user?.user_id;
    const role = req.user?.role;

    let query = supabase
      .from("report")
      .select("*")
      .order("date_generated", { ascending: false });

    // Non-admin users only see their own reports
    if (role !== 'Admin' && user_id) {
      query = query.eq("user_id", user_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ reports: data || [] });
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get single report by ID
export const getReportById = async (req, res) => {
  try {
    const { report_id } = req.params;

    const { data, error } = await supabase
      .from("report")
      .select("*")
      .eq("report_id", report_id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: "Report not found" });
    }

    res.json(data);
  } catch (error) {
    console.error("Error fetching report:", error);
    res.status(500).json({ error: error.message });
  }
};

// Delete report
export const deleteReport = async (req, res) => {
  try {
    const { report_id } = req.params;

    // Fetch filepath before delete so we can clean up storage
    const { data: existing } = await supabase
      .from("report")
      .select("filepath")
      .eq("report_id", report_id)
      .single();

    const { error } = await supabase
      .from("report")
      .delete()
      .eq("report_id", report_id);

    if (error) throw error;

    // Remove file from Supabase Storage
    if (existing?.filepath) {
      try {
        // Extract object path: everything after /{bucket}/
        const marker = `/${REPORTS_BUCKET}/`;
        const idx = existing.filepath.indexOf(marker);
        if (idx !== -1) {
          const objectPath = existing.filepath.slice(idx + marker.length);
          await supabase.storage.from(REPORTS_BUCKET).remove([objectPath]);
        }
      } catch (storageErr) {
        console.error("Storage cleanup failed (non-fatal):", storageErr.message);
      }
    }

    res.json({ message: "Report deleted successfully" });
  } catch (error) {
    console.error("Error deleting report:", error);
    res.status(500).json({ error: error.message });
  }
};
