import { supabase } from "../../config/supabase.js";
import PDFDocument from 'pdfkit';

// ─── Certificate storage helpers ──────────────────────────────────────────────
const CERT_BUCKET = 'certificates';

async function ensureCertBucketExists() {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some(b => b.name === CERT_BUCKET);
    if (!exists) {
      await supabase.storage.createBucket(CERT_BUCKET, { public: true });
    }
  } catch {
    // proceed — bucket may already exist
  }
}

async function uploadCertificateToStorage(fileBuffer, objectPath) {
  await ensureCertBucketExists();
  const { error } = await supabase.storage
    .from(CERT_BUCKET)
    .upload(objectPath, fileBuffer, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`Certificate storage upload failed: ${error.message}`);
  const { data } = supabase.storage.from(CERT_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

// ─── Certificate PDF builder ──────────────────────────────────────────────────
const SUBJECT_COLORS = {
  Mathematics: '#3b82f6', Math: '#3b82f6',
  English:     '#22c55e',
  Science:     '#a855f7',
  Geography:   '#14b8a6',
  History:     '#f59e0b',
  Art:         '#ec4899',
  Music:       '#6366f1',
};

function buildCertificatePDF({ kidName, subject, percentage, kidScore, maxScore, issueDate, certificateId }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0,
      info: {
        Title: `${subject} Certificate — ${kidName}`,
        Author: 'EduKid Platform',
        Subject: `${subject} Achievement Certificate`,
        CreationDate: new Date(issueDate),
      },
    });

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Dimensions & colours ──────────────────────────────────────────────────
    const W = 841.89;
    const H = 595.28;
    const accent = SUBJECT_COLORS[subject] || '#4f46e5';

    // ── Background ────────────────────────────────────────────────────────────
    doc.rect(0, 0, W, H).fill('#fffdf5');

    // Accent border (4 edges, 7 pt thick)
    const B = 7;
    doc.rect(0,     0,     W,  B).fill(accent);   // top
    doc.rect(0,     H - B, W,  B).fill(accent);   // bottom
    doc.rect(0,     0,     B,  H).fill(accent);   // left
    doc.rect(W - B, 0,     B,  H).fill(accent);   // right

    // Inner dashed border
    doc.rect(18, 18, W - 36, H - 36)
      .strokeColor(accent).lineWidth(1).dash(5, { space: 5 }).stroke();
    doc.undash();

    // Corner ornament dots
    const corners = [[46, 46], [W - 46, 46], [46, H - 46], [W - 46, H - 46]];
    corners.forEach(([cx, cy]) => {
      doc.circle(cx, cy, 5).fill(accent);
      doc.circle(cx, cy, 10).strokeColor(accent).lineWidth(0.8).stroke();
    });

    // ── Header bar ────────────────────────────────────────────────────────────
    const headerH = 78;
    doc.rect(0, 0, W, headerH).fill(accent);

    // Brand name (left of header)
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(24)
      .text('EduKid', 50, 16, { lineBreak: false });
    doc.fillColor('rgba(255,255,255,0.65)').font('Helvetica').fontSize(10)
      .text('Educational Platform', 50, 44, { lineBreak: false });

    // Certificate title (centred in header)
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(19)
      .text('CERTIFICATE OF ACHIEVEMENT', 0, 28, { width: W, align: 'center', lineBreak: false });

    // ── Layout zones ──────────────────────────────────────────────────────────
    const contentTop    = headerH + 14;          // y where content starts (≈92)
    const footerLineY   = H - 70;                // y of footer separator  (≈525)
    const contentH      = footerLineY - contentTop; // ≈433

    // LEFT column — badge, x=50..280, visual centre at x=165
    const badgeCX = 175;
    const badgeCY = contentTop + contentH / 2;   // vertically centred ≈ 308
    const badgeR  = 68;

    // RIGHT column — all text, x=310..W-50
    const textX = 310;
    const textW = W - textX - 50;               // ≈ 481

    // Vertical divider between columns
    doc.moveTo(288, contentTop + 20).lineTo(288, footerLineY - 20)
      .strokeColor('#e5e7eb').lineWidth(0.8).stroke();

    // ── Badge (left column) ───────────────────────────────────────────────────
    // Outer glow ring
    doc.circle(badgeCX, badgeCY, badgeR + 14).fill('#ffffff');
    doc.circle(badgeCX, badgeCY, badgeR + 14)
      .strokeColor(accent).lineWidth(1.2).dash(4, { space: 4 }).stroke();
    doc.undash();
    // Filled accent disc
    doc.circle(badgeCX, badgeCY, badgeR).fill(accent);
    // Inner white disc
    doc.circle(badgeCX, badgeCY, badgeR - 14).fill('#ffffff');

    // Percentage text — centred inside inner disc
    const pctW = 110;
    doc.fillColor(accent).font('Helvetica-Bold').fontSize(34)
      .text(`${percentage}%`, badgeCX - pctW / 2, badgeCY - 24, { width: pctW, align: 'center', lineBreak: false });
    doc.fillColor('#9ca3af').font('Helvetica').fontSize(8)
      .text('SCORE', badgeCX - 25, badgeCY + 14, { width: 50, align: 'center', lineBreak: false });

    // Subject label below badge
    doc.fillColor(accent).font('Helvetica-Bold').fontSize(11)
      .text(subject.toUpperCase(), badgeCX - 75, badgeCY + badgeR + 20, { width: 150, align: 'center', lineBreak: false });

    // ── Right text column ─────────────────────────────────────────────────────
    // Calculate total block height and vertically centre it
    const blockLines = [
      14,   // "presented to" (11pt ≈ 14pt line)
      16,   // gap
      44,   // kid name (36pt)
      20,   // gap + rule
      14,   // "excellence in"
      12,   // gap
      40,   // subject pill
      14,   // gap
      14,   // score (if any)
    ];
    const blockH = blockLines.reduce((a, b) => a + b, 0); // 188
    let ty = contentTop + (contentH - blockH) / 2;        // vertically centred

    // "presented to" subtitle
    doc.fillColor('#9ca3af').font('Helvetica').fontSize(11)
      .text('This certificate is proudly presented to', textX, ty, { width: textW, align: 'center', lineBreak: false });
    ty += blockLines[0] + blockLines[1]; // 30

    // Kid name
    doc.fillColor('#1e1b4b').font('Helvetica-Bold').fontSize(36)
      .text(kidName, textX, ty, { width: textW, align: 'center', lineBreak: false });
    ty += blockLines[2]; // 44

    // Decorative rule under name
    const ruleCX = textX + textW / 2;
    doc.moveTo(ruleCX - 130, ty + 6).lineTo(ruleCX + 130, ty + 6)
      .strokeColor(accent).lineWidth(1.4).stroke();
    ty += blockLines[3]; // 20

    // "for excellence in"
    doc.fillColor('#6b7280').font('Helvetica').fontSize(11)
      .text('for successfully completing and achieving excellence in', textX, ty, { width: textW, align: 'center', lineBreak: false });
    ty += blockLines[4] + blockLines[5]; // 26

    // Subject pill
    const pillH  = blockLines[6]; // 40
    const pillW  = Math.min(textW * 0.62, 230);
    const pillX  = textX + (textW - pillW) / 2;
    doc.roundedRect(pillX, ty, pillW, pillH, pillH / 2).fill(accent);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(17)
      .text(subject, pillX, ty + 12, { width: pillW, align: 'center', lineBreak: false });
    ty += pillH + blockLines[7]; // 54

    // Score line
    if (maxScore > 0) {
      doc.fillColor('#9ca3af').font('Helvetica').fontSize(11)
        .text(`Scored ${kidScore} out of ${maxScore} points`, textX, ty, { width: textW, align: 'center', lineBreak: false });
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.moveTo(50, footerLineY).lineTo(W - 50, footerLineY)
      .strokeColor('#d1d5db').lineWidth(0.8).stroke();

    const fl = footerLineY + 10; // label row
    const fv = footerLineY + 24; // value row

    // Left — date
    doc.fillColor('#9ca3af').font('Helvetica').fontSize(8)
      .text('DATE ISSUED', 60, fl, { width: 200, lineBreak: false });
    doc.fillColor('#1e1b4b').font('Helvetica-Bold').fontSize(10)
      .text(
        new Date(issueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
        60, fv, { width: 200, lineBreak: false }
      );

    // Centre — cert ID
    doc.fillColor('#9ca3af').font('Helvetica').fontSize(8)
      .text('CERTIFICATE ID', 0, fl, { width: W, align: 'center', lineBreak: false });
    doc.fillColor('#6b7280').font('Helvetica').fontSize(8)
      .text(certificateId, 0, fv, { width: W, align: 'center', lineBreak: false });

    // Right — issued by
    doc.fillColor('#9ca3af').font('Helvetica').fontSize(8)
      .text('ISSUED BY', W - 260, fl, { width: 200, align: 'right', lineBreak: false });
    doc.fillColor(accent).font('Helvetica-Bold').fontSize(10)
      .text('EduKid Platform', W - 260, fv, { width: 200, align: 'right', lineBreak: false });

    doc.end();
  });
}

// Get all certificates for a user's kids
export const getUserCertificates = async (req, res) => {
  try {
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data, error } = await supabase
      .from("certificate")
      .select(`
        *,
        progress!inner(
          kid_profile!inner(
            kid_id,
            fname,
            lname,
            user_id
          )
        ),
        subscription(
          subscription_id,
          billing_period,
          payment_status
        )
      `)
      .eq("progress.kid_profile.user_id", user_id)
      .order("issue_date", { ascending: false });

    if (error) throw error;

    res.json({ certificates: data || [] });
  } catch (error) {
    console.error("Error fetching certificates:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get certificates for a specific kid
export const getKidCertificates = async (req, res) => {
  try {
    const { kid_id } = req.params;
    const user_id = req.user?.user_id;

    // Verify kid belongs to user
    const { data: kidData, error: kidError } = await supabase
      .from("kid_profile")
      .select("user_id")
      .eq("kid_id", kid_id)
      .single();

    if (kidError || !kidData || kidData.user_id !== user_id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const { data, error } = await supabase
      .from("certificate")
      .select(`
        *,
        progress!inner(kid_id),
        subscription(billing_period, payment_status)
      `)
      .eq("progress.kid_id", kid_id)
      .order("issue_date", { ascending: false });

    if (error) throw error;

    res.json({ certificates: data || [] });
  } catch (error) {
    console.error("Error fetching kid certificates:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get a single certificate by ID
export const getCertificateById = async (req, res) => {
  try {
    const { certificate_id } = req.params;
    const user_id = req.user?.user_id;

    const { data, error } = await supabase
      .from("certificate")
      .select(`
        *,
        progress!inner(
          kid_profile!inner(
            kid_id,
            fname,
            lname,
            user_id
          )
        ),
        subscription(
          subscription_id,
          billing_period
        )
      `)
      .eq("certificate_id", certificate_id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: "Certificate not found" });
    }

    // Verify user owns this certificate
    if (data.progress.kid_profile.user_id !== user_id && req.user?.role !== "Admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    res.json(data);
  } catch (error) {
    console.error("Error fetching certificate:", error);
    res.status(500).json({ error: error.message });
  }
};

// Issue a new certificate
export const issueCertificate = async (req, res) => {
  try {
    const {
      progress_id,
      subscription_id,
      file_url,
      subject,
    } = req.body;

    const user_id = req.user?.user_id;

    if (!progress_id || !subscription_id) {
      return res.status(400).json({ error: "Progress ID and Subscription ID are required" });
    }

    // Verify progress belongs to user's kid
    const { data: progressData, error: progressError } = await supabase
      .from("progress")
      .select(`
        kid_profile!inner(user_id)
      `)
      .eq("progress_id", progress_id)
      .single();

    if (progressError || !progressData || progressData.kid_profile.user_id !== user_id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Verify subscription is active and belongs to user
    const { data: subData, error: subError } = await supabase
      .from("subscription")
      .select("user_id, is_active")
      .eq("subscription_id", subscription_id)
      .single();

    if (subError || !subData || subData.user_id !== user_id) {
      return res.status(403).json({ error: "Invalid subscription" });
    }

    if (!subData.is_active) {
      return res.status(400).json({ error: "Subscription must be active to issue certificate" });
    }

    // Fetch kid name from progress record
    const { data: kidData } = await supabase
      .from("progress")
      .select("kid_profile!inner(fname, lname, kid_id)")
      .eq("progress_id", progress_id)
      .single();

    const kidName = kidData?.kid_profile
      ? `${kidData.kid_profile.fname} ${kidData.kid_profile.lname}`
      : 'Student';
    const kid_id = kidData?.kid_profile?.kid_id;

    // Compute score for this subject (same logic as getSubjectEligibility)
    let kidScore = 0;
    let maxScore = 0;
    let percentage = 0;
    if (subject && kid_id) {
      const [
        { data: allQuizzes },
        { data: allGames },
        { data: kidQuizzes },
        { data: kidGames },
      ] = await Promise.all([
        supabase.from("quiz").select("quiz_id, subject, score").eq("subject", subject),
        supabase.from("game").select("game_id, subject, max_score").eq("subject", subject),
        supabase.from("kid_quiz").select("quiz_id, score").eq("kid_id", kid_id).eq("completion_status", "Completed"),
        supabase.from("kid_game").select("game_id, score").eq("kid_id", kid_id),
      ]);

      const quizIds = new Set((allQuizzes || []).map(q => q.quiz_id));
      const gameIds = new Set((allGames || []).map(g => g.game_id));

      (allQuizzes || []).forEach(q => { maxScore += (q.score || 0); });
      (allGames || []).forEach(g => { maxScore += (g.max_score || 0); });
      (kidQuizzes || []).filter(kq => quizIds.has(kq.quiz_id)).forEach(kq => { kidScore += (kq.score || 0); });

      const bestGameScore = {};
      (kidGames || []).filter(kg => gameIds.has(kg.game_id)).forEach(({ game_id, score }) => {
        if (!bestGameScore[game_id] || (score || 0) > bestGameScore[game_id]) {
          bestGameScore[game_id] = score || 0;
        }
      });
      Object.values(bestGameScore).forEach(s => { kidScore += s; });

      percentage = maxScore > 0 ? Math.min(100, Math.round((kidScore / maxScore) * 100)) : 100;
    }

    const certificate_id = `cert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const issue_date = new Date().toISOString().split('T')[0];

    // Generate PDF certificate
    let resolvedFileUrl = file_url;
    if (!resolvedFileUrl) {
      try {
        const pdfBuffer = await buildCertificatePDF({
          kidName,
          subject: subject || 'General',
          percentage,
          kidScore,
          maxScore,
          issueDate: issue_date,
          certificateId: certificate_id,
        });
        const objectPath = `${certificate_id}/subject/${subject || 'general'}.pdf`;
        resolvedFileUrl = await uploadCertificateToStorage(pdfBuffer, objectPath);
      } catch (pdfErr) {
        console.error('PDF generation failed, using placeholder:', pdfErr.message);
        resolvedFileUrl = subject
          ? `/certificates/${certificate_id}/subject/${subject}.pdf`
          : `/certificates/${certificate_id}.pdf`;
      }
    }

    const certificateData = {
      certificate_id,
      issue_date,
      status: "Active",
      file_url: resolvedFileUrl,
      progress_id,
      subscription_id,
    };

    const { data, error } = await supabase
      .from("certificate")
      .insert(certificateData)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: "Certificate issued successfully", certificate: data });
  } catch (error) {
    console.error("Error issuing certificate:", error);
    res.status(500).json({ error: error.message });
  }
};

// Update certificate status
export const updateCertificateStatus = async (req, res) => {
  try {
    const { certificate_id } = req.params;
    const { status } = req.body;

    if (!status || !["Active", "Revoked", "Pending"].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be Active, Revoked, or Pending" });
    }

    const user_id = req.user?.user_id;

    // Verify certificate belongs to user (or user is admin)
    const { data: certData, error: certError } = await supabase
      .from("certificate")
      .select(`
        progress!inner(
          kid_profile!inner(user_id)
        )
      `)
      .eq("certificate_id", certificate_id)
      .single();

    if (certError || !certData) {
      return res.status(404).json({ error: "Certificate not found" });
    }

    if (certData.progress.kid_profile.user_id !== user_id && req.user?.role !== "Admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const { data, error } = await supabase
      .from("certificate")
      .update({ status })
      .eq("certificate_id", certificate_id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: "Certificate status updated", certificate: data });
  } catch (error) {
    console.error("Error updating certificate status:", error);
    res.status(500).json({ error: error.message });
  }
};

// Delete/revoke certificate
export const deleteCertificate = async (req, res) => {
  try {
    const { certificate_id } = req.params;
    const user_id = req.user?.user_id;

    // Verify certificate belongs to user (or user is admin)
    const { data: certData, error: certError } = await supabase
      .from("certificate")
      .select(`
        progress!inner(
          kid_profile!inner(user_id)
        )
      `)
      .eq("certificate_id", certificate_id)
      .single();

    if (certError || !certData) {
      return res.status(404).json({ error: "Certificate not found" });
    }

    if (certData.progress.kid_profile.user_id !== user_id && req.user?.role !== "Admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Instead of deleting, revoke it
    const { data, error } = await supabase
      .from("certificate")
      .update({ status: "Revoked" })
      .eq("certificate_id", certificate_id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: "Certificate revoked", certificate: data });
  } catch (error) {
    console.error("Error revoking certificate:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get per-subject score eligibility for a kid (score >= 75% of max = eligible)
export const getSubjectEligibility = async (req, res) => {
  try {
    const { kid_id } = req.params;
    const user_id = req.user?.user_id;
    if (!user_id) return res.status(401).json({ error: "Unauthorized" });

    // Verify kid belongs to user
    const { data: kid, error: kidErr } = await supabase
      .from("kid_profile")
      .select("kid_id, user_id")
      .eq("kid_id", kid_id)
      .single();

    if (kidErr || !kid) return res.status(404).json({ error: "Kid not found" });
    if (kid.user_id !== user_id && req.user?.role !== "Admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Fetch all quizzes, all games, kid's completed quiz scores, kid's game scores in parallel
    const [
      { data: allQuizzes },
      { data: allGames },
      { data: kidQuizzes },
      { data: kidGames },
    ] = await Promise.all([
      supabase.from("quiz").select("quiz_id, subject, score"),
      supabase.from("game").select("game_id, subject, max_score"),
      supabase.from("kid_quiz").select("quiz_id, score").eq("kid_id", kid_id).eq("completion_status", "Completed"),
      supabase.from("kid_game").select("game_id, score").eq("kid_id", kid_id),
    ]);

    // Best (max) score per game_id across all play dates
    const bestGameScore = {};
    (kidGames || []).forEach(({ game_id, score }) => {
      if (!bestGameScore[game_id] || (score || 0) > bestGameScore[game_id]) {
        bestGameScore[game_id] = score || 0;
      }
    });

    // Lookup maps: id → { subject, max }
    const quizMeta = {};
    (allQuizzes || []).forEach(q => { quizMeta[q.quiz_id] = { subject: q.subject, max: q.score || 0 }; });
    const gameMeta = {};
    (allGames || []).forEach(g => { gameMeta[g.game_id] = { subject: g.subject, max: g.max_score || 0 }; });

    // Accumulate max_score and kid_score per subject
    const subjectMap = {};
    const ensureSubject = (name) => {
      if (!name) return;
      if (!subjectMap[name]) subjectMap[name] = { max_score: 0, kid_score: 0, kid_activities: 0 };
    };

    (allQuizzes || []).forEach(q => {
      ensureSubject(q.subject);
      if (q.subject) subjectMap[q.subject].max_score += (q.score || 0);
    });
    (allGames || []).forEach(g => {
      ensureSubject(g.subject);
      if (g.subject) subjectMap[g.subject].max_score += (g.max_score || 0);
    });
    (kidQuizzes || []).forEach(kq => {
      const meta = quizMeta[kq.quiz_id];
      if (meta?.subject && subjectMap[meta.subject]) {
        subjectMap[meta.subject].kid_score += (kq.score || 0);
        subjectMap[meta.subject].kid_activities += 1;
      }
    });
    Object.entries(bestGameScore).forEach(([game_id, score]) => {
      const meta = gameMeta[game_id];
      if (meta?.subject && subjectMap[meta.subject]) {
        subjectMap[meta.subject].kid_score += score;
        subjectMap[meta.subject].kid_activities += 1;
      }
    });

    // Check which subjects already have an active certificate for this kid
    const { data: kidProgressRows } = await supabase
      .from("progress")
      .select("progress_id")
      .eq("kid_id", kid_id);

    const progressIds = (kidProgressRows || []).map(p => p.progress_id);
    const issuedSubjects = new Set();
    const subjectFileUrl = {};  // subject → public file_url
    if (progressIds.length > 0) {
      const { data: existingCerts } = await supabase
        .from("certificate")
        .select("file_url, certificate_id")
        .in("progress_id", progressIds)
        .eq("status", "Active");
      (existingCerts || []).forEach(cert => {
        // Matches both storage URL (.../subject/{subject}.pdf) and legacy placeholder
        const match = cert.file_url?.match(/\/subject\/(.+)\.pdf(?:[?#].*)?$/);
        if (match) {
          issuedSubjects.add(match[1]);
          subjectFileUrl[match[1]] = cert.file_url;
        }
      });
    }

    // Build final response — show subjects that have content OR that the kid has attempted
    const subjects = Object.entries(subjectMap)
      .filter(([, d]) => d.max_score > 0 || d.kid_activities > 0)
      .map(([subject, d]) => {
        let percentage = 0;
        if (d.max_score > 0) {
          percentage = Math.min(100, Math.round((d.kid_score / d.max_score) * 100));
        } else if (d.kid_activities > 0) {
          // No defined max score — treat completion of any activity as 100%
          percentage = 100;
        }
        return {
          subject,
          kid_score: d.kid_score,
          max_score: d.max_score,
          percentage,
          eligible: percentage >= 75,
          certificate_issued: issuedSubjects.has(subject),
          file_url: subjectFileUrl[subject] || null,
        };
      })
      .sort((a, b) => b.percentage - a.percentage);

    res.json({ kid_id, subjects });
  } catch (error) {
    console.error("Error fetching subject eligibility:", error);
    res.status(500).json({ error: error.message });
  }
};
