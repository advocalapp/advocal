UPDATE legal_pages SET
  title = 'About Us',
  content = '<div style="font-family:Inter,sans-serif;margin:-16px -20px 0;">

<!-- Hero Banner -->
<div style="background:linear-gradient(135deg,#0D1A3A 0%,#1A3A6B 60%,#1A56DB 100%);padding:40px 24px 32px;text-align:center;">
  <!-- Logo Circle -->
  <div style="width:72px;height:72px;background:rgba(255,255,255,0.12);border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,0.25);">
    <span style="font-size:34px;line-height:1;">⚖️</span>
  </div>
  <!-- Brand Name -->
  <div style="font-size:28px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;margin-bottom:6px;">AdvoCal</div>
  <div style="font-size:13px;font-weight:500;color:rgba(255,255,255,0.7);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:16px;">Legal Calendar Platform</div>
  <!-- Tagline Pill -->
  <div style="display:inline-block;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);border-radius:20px;padding:6px 18px;">
    <span style="font-size:13px;font-weight:600;color:#FFFFFF;">Your Legal Day, Simplified.</span>
  </div>
</div>

<!-- Body Content -->
<div style="padding:24px 20px 48px;">

  <p style="font-size:15px;font-weight:400;color:#374151;line-height:1.8;margin:0 0 16px;">AdvoCal is a legal calendar and case management platform designed specifically for advocates, law firms, and legal professionals across India. Managing court dates, hearings, client matters, and legal schedules can be challenging. AdvoCal helps simplify this process by bringing all your important legal activities into one organized and easy-to-use platform.</p>

  <p style="font-size:15px;font-weight:400;color:#374151;line-height:1.8;margin:0 0 24px;">Our mission is to help legal professionals stay organized, reduce missed hearings, and manage their daily legal workflow more efficiently. Whether you are an independent advocate or part of a growing law firm, AdvoCal provides the tools you need to track upcoming hearings, manage case details, maintain client records, and stay informed about important legal dates.</p>

  <!-- Features Heading -->
  <div style="font-size:16px;font-weight:800;color:#0D1A3A;margin:0 0 16px;">Key Features of AdvoCal</div>

  <!-- Feature Cards -->
  <div style="display:grid;gap:10px;margin-bottom:28px;">

    <div style="display:flex;align-items:center;gap:14px;background:#F0F5FF;border-radius:12px;padding:14px 16px;border-left:4px solid #1A56DB;">
      <span style="font-size:22px;flex-shrink:0;">📅</span>
      <span style="font-size:14px;font-weight:700;color:#0D1A3A;">Legal Calendar Management</span>
    </div>

    <div style="display:flex;align-items:center;gap:14px;background:#F0F5FF;border-radius:12px;padding:14px 16px;border-left:4px solid #1A56DB;">
      <span style="font-size:22px;flex-shrink:0;">🔔</span>
      <span style="font-size:14px;font-weight:700;color:#0D1A3A;">Hearing Date Tracking &amp; Reminders</span>
    </div>

    <div style="display:flex;align-items:center;gap:14px;background:#F0F5FF;border-radius:12px;padding:14px 16px;border-left:4px solid #1A56DB;">
      <span style="font-size:22px;flex-shrink:0;">📊</span>
      <span style="font-size:14px;font-weight:700;color:#0D1A3A;">Case Management Dashboard</span>
    </div>

    <div style="display:flex;align-items:center;gap:14px;background:#F0F5FF;border-radius:12px;padding:14px 16px;border-left:4px solid #1A56DB;">
      <span style="font-size:22px;flex-shrink:0;">👥</span>
      <span style="font-size:14px;font-weight:700;color:#0D1A3A;">Client &amp; Case Record Organization</span>
    </div>

    <div style="display:flex;align-items:center;gap:14px;background:#F0F5FF;border-radius:12px;padding:14px 16px;border-left:4px solid #1A56DB;">
      <span style="font-size:22px;flex-shrink:0;">🏛️</span>
      <span style="font-size:14px;font-weight:700;color:#0D1A3A;">Court Schedule Monitoring</span>
    </div>

    <div style="display:flex;align-items:center;gap:14px;background:#F0F5FF;border-radius:12px;padding:14px 16px;border-left:4px solid #1A56DB;">
      <span style="font-size:22px;flex-shrink:0;">☁️</span>
      <span style="font-size:14px;font-weight:700;color:#0D1A3A;">Secure Cloud-Based Access</span>
    </div>

    <div style="display:flex;align-items:center;gap:14px;background:#F0F5FF;border-radius:12px;padding:14px 16px;border-left:4px solid #1A56DB;">
      <span style="font-size:22px;flex-shrink:0;">📱</span>
      <span style="font-size:14px;font-weight:700;color:#0D1A3A;">Mobile-Friendly Experience</span>
    </div>

  </div>

  <p style="font-size:15px;font-weight:400;color:#374151;line-height:1.8;margin:0 0 24px;">At AdvoCal, we believe technology should simplify legal practice, allowing advocates to focus more on their clients and legal work rather than administrative tasks.</p>

  <!-- Footer Tagline -->
  <div style="background:linear-gradient(135deg,#0D1A3A,#1A56DB);border-radius:14px;padding:20px;text-align:center;">
    <div style="font-size:20px;margin-bottom:8px;">⚖️</div>
    <div style="font-size:15px;font-weight:700;color:#FFFFFF;">AdvoCal</div>
    <div style="font-size:13px;font-weight:500;color:rgba(255,255,255,0.8);margin-top:4px;">Your Legal Day, Simplified.</div>
  </div>

</div>
</div>',
  updated_at = NOW()
WHERE id = 'about_us';