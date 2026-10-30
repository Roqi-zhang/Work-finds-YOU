// Injected on demand. Returns best-effort job info: JSON-LD -> site adapters -> generic fallback.
(() => {
  const txt = (sel) => { const el = sel && document.querySelector(sel); return el ? el.innerText.trim() : ""; };
  const clean = (s) => (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const out = { url: location.href.split("#")[0], title: "", company: "", location: "", salary: "", jd_text: "" };

  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      let d = JSON.parse(s.textContent);
      const list = [].concat(d["@graph"] || d);
      const jp = list.find((x) => x && [].concat(x["@type"]).includes("JobPosting"));
      if (!jp) continue;
      out.title = clean(jp.title);
      out.company = clean(jp.hiringOrganization?.name);
      const loc = [].concat(jp.jobLocation || [])[0]?.address;
      out.location = clean(typeof loc === "string" ? loc : [loc?.addressLocality, loc?.addressRegion, loc?.addressCountry?.name || loc?.addressCountry].filter(Boolean).join(", "));
      const v = jp.baseSalary?.value;
      if (v) out.salary = clean([v.minValue, v.maxValue].filter(Boolean).join("-") + " " + (jp.baseSalary.currency || "") + (v.unitText ? "/" + v.unitText : ""));
      out.jd_text = clean(jp.description);
      break;
    } catch (_) {}
  }

  const h = location.hostname;
  const A = [
    [/zhipin\.com/, { title: ".job-banner .name h1, .name h1", company: ".company-info a[ka='job-detail-company_custompage'], .sider-company .company-info a", location: ".text-city", salary: ".job-banner .salary", jd: ".job-sec-text" }],
    [/liepin\.com/, { title: ".job-title, .name-box .name", company: ".company-name, .company-info-container .name", location: ".job-properties span", salary: ".job-salary", jd: ".job-intro-container dd, .job-intro-container" }],
    [/lagou\.com/, { title: ".position-head-wrap-name, .job-name .name", company: ".job_company_content .fl, .company", location: ".work_addr", salary: ".salary", jd: ".job-detail" }],
    [/zhaopin\.com/, { title: ".summary-plane__title, .job-summary h3", company: ".company__title, .company-name", location: ".summary-plane__info li", salary: ".summary-plane__salary", jd: ".describtion__detail-content, .job-detail" }],
    [/linkedin\.com/, { title: ".job-details-jobs-unified-top-card__job-title, .top-card-layout__title", company: ".job-details-jobs-unified-top-card__company-name, .topcard__org-name-link", location: ".job-details-jobs-unified-top-card__primary-description-container span, .topcard__flavor--bullet", salary: ".salary", jd: "#job-details, .description__text" }],
    [/indeed\./, { title: "h1.jobsearch-JobInfoHeader-title, [data-testid='jobsearch-JobInfoHeader-title']", company: "[data-testid='inlineHeader-companyName'], [data-company-name]", location: "[data-testid='inlineHeader-companyLocation'], [data-testid='job-location']", salary: "#salaryInfoAndJobType", jd: "#jobDescriptionText" }],
    [/glassdoor\./, { title: "[data-test='job-title'], h1", company: "[data-test='employer-name']", location: "[data-test='location']", salary: "[data-test='detailSalary']", jd: "[class*='JobDetails_jobDescription'], .jobDescriptionContent" }],
  ];
  const ad = A.find(([re]) => re.test(h));
  if (ad) {
    const s = ad[1];
    out.title ||= txt(s.title); out.company ||= txt(s.company); out.location ||= txt(s.location);
    out.salary ||= txt(s.salary); out.jd_text ||= txt(s.jd);
  }

  const sel = String(window.getSelection() || "").trim();
  if (sel.length > 40) out.jd_text = sel;
  out.title ||= txt("h1") || document.title;
  if (!out.jd_text) {
    let best = "";
    document.querySelectorAll("article, section, main, div").forEach((el) => {
      if (el.children.length > 60) return;
      const t = el.innerText || "";
      if (t.length > best.length && t.length < 20000) best = t;
    });
    out.jd_text = best.trim();
  }
  out.jd_text = out.jd_text.slice(0, 30000);
  return out;
})();
