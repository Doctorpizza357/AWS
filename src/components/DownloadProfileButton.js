import React from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Chart from 'chart.js/auto';

export default function DownloadProfileButton({ quizResults = {}, marketInsights = {}, actionPlan = {}, progress = {}, badges = [], portfolio = [] }) {

  const generatePDF = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = 0;

    // Color palette
    const colors = {
      primary: '#0B3D91',
      primaryDark: '#062554',
      accent: '#00C9A7',
      accentAmber: '#F59E0B',
      dark: '#1E293B',
      text: '#334155',
      textLight: '#64748B',
      lightBg: '#F1F5F9',
      white: '#FFFFFF',
      danger: '#EF4444',
      success: '#10B981',
    };

    const safeText = (t) => (t === undefined || t === null ? '' : String(t));
    const badgeLabelMap = {
      'badge-first-step': 'Route',
      'badge-explorer': 'Compass',
      'badge-decision-maker': 'Zap',
      'badge-deep-diver': 'Waves',
      'badge-level-5': 'Star',
      'badge-level-10': 'Trophy',
      'badge-quick-thinker': 'Bulb',
      'badge-team-player': 'Team',
    };

    // ===== HELPER FUNCTIONS =====
    const ensureSpace = (needed = 120) => {
      if (y + needed > pageHeight - 60) {
        doc.addPage();
        y = 50;
      }
    };

    const drawPageHeader = (title) => {
      doc.setFillColor(colors.primary);
      doc.rect(0, 0, pageWidth, 6, 'F');
      doc.setFillColor(colors.accent);
      doc.rect(0, 6, pageWidth * 0.3, 2, 'F');
    };

    const drawSectionTitle = (title, subtitle) => {
      ensureSpace(60);
      doc.setFillColor(colors.lightBg);
      doc.roundedRect(margin - 8, y - 4, pageWidth - margin * 2 + 16, subtitle ? 38 : 28, 4, 4, 'F');
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(colors.primary);
      doc.text(title, margin, y + 14);
      if (subtitle) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(colors.textLight);
        doc.text(subtitle, margin, y + 28);
        y += 48;
      } else {
        y += 38;
      }
    };

    const drawMetricBox = (x, w, label, value, color) => {
      doc.setFillColor(colors.white);
      doc.roundedRect(x, y, w, 52, 4, 4, 'F');
      doc.setDrawColor(color || colors.primary);
      doc.setLineWidth(0.5);
      doc.roundedRect(x, y, w, 52, 4, 4, 'S');
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(color || colors.primary);
      doc.text(safeText(value), x + w / 2, y + 24, { align: 'center' });
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(colors.textLight);
      doc.text(label, x + w / 2, y + 42, { align: 'center' });
    };

    const renderChartToImage = (config, width = 800, height = 300) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.style.position = 'absolute';
      canvas.style.left = '-9999px';
      canvas.style.top = '0px';
      document.body.appendChild(canvas);
      const chart = new Chart(canvas.getContext('2d'), {
        ...config,
        options: { ...config.options, responsive: false, animation: false }
      });
      try { chart.update(); chart.render(); } catch (e) {}
      const img = canvas.toDataURL('image/png');
      try { chart.destroy(); } catch (e) {}
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      return img;
    };

    // ===== PAGE 1: COVER & EXECUTIVE SUMMARY =====
    drawPageHeader();

    // Cover header
    doc.setFillColor(colors.primaryDark);
    doc.rect(0, 0, pageWidth, 140, 'F');
    // Accent bar
    doc.setFillColor(colors.accent);
    doc.rect(margin, 120, 80, 4, 'F');

    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colors.white);
    const userName = quizResults.name || 'STEM Explorer';
    doc.text(userName, margin, 55);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#94A3B8');
    doc.text('STEM Career Intelligence Report', margin, 78);

    doc.setFontSize(9);
    doc.setTextColor('#64748B');
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(`Generated ${dateStr} • STEM Career Explorer Platform`, margin, 100);

    y = 160;

    // Executive Summary Metrics
    drawSectionTitle('Executive Summary', 'Your career exploration snapshot at a glance');

    const metricWidth = (pageWidth - margin * 2 - 30) / 4;
    drawMetricBox(margin, metricWidth, 'LEVEL', String(progress.level || 1), colors.primary);
    drawMetricBox(margin + metricWidth + 10, metricWidth, 'SCENARIOS', String((progress.completedScenarios || []).length), colors.accent);
    drawMetricBox(margin + (metricWidth + 10) * 2, metricWidth, 'DECISIONS', String((progress.decisions || []).length), colors.accentAmber);
    drawMetricBox(margin + (metricWidth + 10) * 3, metricWidth, 'BADGES', String((progress.badges || []).length), colors.success);
    y += 64;

    // Profile overview
    ensureSpace(80);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colors.dark);
    doc.text('Interests:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colors.text);
    const interests = (quizResults.strengths || []).join('  •  ') || 'Not specified';
    doc.text(interests, margin + 55, y);
    y += 20;

    // ===== TOP CAREER MATCHES =====
    drawSectionTitle('Career Match Analysis', 'Roles ranked by compatibility with your profile');

    const matches = Array.isArray(quizResults.topMatches) ? quizResults.topMatches : [];
    if (matches.length) {
      // Match comparison bar chart
      const matchChartImg = renderChartToImage({
        type: 'bar',
        data: {
          labels: matches.map(m => m.role || 'Unknown'),
          datasets: [{
            label: 'Match Score (%)',
            data: matches.map(m => m.score || 0),
            backgroundColor: matches.map((_, i) => i === 0 ? colors.accent : i === 1 ? colors.primary : '#94A3B8'),
            borderRadius: 6,
            barThickness: 32,
          }]
        },
        options: {
          indexAxis: 'y',
          scales: { x: { max: 100, grid: { color: '#E2E8F0' } }, y: { grid: { display: false } } },
          plugins: { legend: { display: false } }
        }
      }, 800, 250);

      ensureSpace(180);
      doc.addImage(matchChartImg, 'PNG', margin, y, pageWidth - margin * 2, 150);
      y += 160;

      // Detailed table
      ensureSpace(80);
      autoTable(doc, {
        startY: y,
        head: [['Rank', 'Career Role', 'Match Score', 'Field & Salary Range']],
        body: matches.map((m, i) => [
          `#${i + 1}`,
          safeText(m.role),
          `${m.score || 0}%`,
          safeText(m.note)
        ]),
        theme: 'striped',
        styles: { fontSize: 9, textColor: colors.text, cellPadding: 8 },
        headStyles: { fillColor: colors.primaryDark, textColor: colors.white, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: '#F8FAFC' },
        margin: { left: margin, right: margin },
      });
      y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 16 : y + 80;
    }

    // ===== SKILLS ASSESSMENT =====
    doc.addPage();
    y = 50;
    drawPageHeader();
    drawSectionTitle('Skills Assessment', 'Your current skill proficiency levels');

    if (Array.isArray(actionPlan.skills) && actionPlan.skills.length) {
      const skillLabels = actionPlan.skills.map(s => s.name);
      const skillValues = actionPlan.skills.map((s, i) => {
        if (typeof s.level === 'number') return s.level;
        return 60 + (i * 5) % 30;
      });

      // Radar chart for skills
      const radarImg = renderChartToImage({
        type: 'radar',
        data: {
          labels: skillLabels,
          datasets: [{
            label: 'Proficiency',
            data: skillValues,
            backgroundColor: 'rgba(0, 201, 167, 0.15)',
            borderColor: colors.accent,
            borderWidth: 2,
            pointBackgroundColor: colors.accent,
            pointRadius: 4,
          }]
        },
        options: {
          scales: { r: { min: 0, max: 100, ticks: { stepSize: 20 } } },
          plugins: { legend: { display: false } }
        }
      }, 600, 400);

      ensureSpace(280);
      const radarWidth = 280;
      doc.addImage(radarImg, 'PNG', (pageWidth - radarWidth) / 2, y, radarWidth, 220);
      y += 235;

      // Skills bar chart
      const barImg = renderChartToImage({
        type: 'bar',
        data: {
          labels: skillLabels,
          datasets: [{
            label: 'Skill Level',
            data: skillValues,
            backgroundColor: skillValues.map(v => v >= 80 ? colors.accent : v >= 60 ? colors.primary : colors.accentAmber),
            borderRadius: 4,
          }]
        },
        options: {
          scales: { y: { max: 100, grid: { color: '#E2E8F0' } }, x: { grid: { display: false } } },
          plugins: { legend: { display: false } }
        }
      }, 800, 280);

      ensureSpace(200);
      doc.addImage(barImg, 'PNG', margin, y, pageWidth - margin * 2, 160);
      y += 175;

      // Skills table
      ensureSpace(80);
      autoTable(doc, {
        startY: y,
        head: [['Skill', 'Proficiency', 'Status']],
        body: actionPlan.skills.map(s => {
          const level = typeof s.level === 'number' ? s.level : 60;
          const status = level >= 80 ? 'Advanced' : level >= 60 ? 'Intermediate' : 'Developing';
          return [safeText(s.name), `${level}%`, status];
        }),
        theme: 'striped',
        styles: { fontSize: 9, textColor: colors.text, cellPadding: 6 },
        headStyles: { fillColor: colors.primaryDark, textColor: colors.white },
        alternateRowStyles: { fillColor: '#F8FAFC' },
        margin: { left: margin, right: margin },
      });
      y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 16 : y + 80;
    }

    // ===== MARKET INTELLIGENCE =====
    doc.addPage();
    y = 50;
    drawPageHeader();
    drawSectionTitle('Market Intelligence', 'Real-time salary data and career viability metrics');

    // Salary overview
    if (marketInsights.averageSalary) {
      ensureSpace(70);
      doc.setFillColor(colors.white);
      doc.roundedRect(margin, y, pageWidth - margin * 2, 50, 6, 6, 'F');
      doc.setDrawColor(colors.accent);
      doc.setLineWidth(1);
      doc.roundedRect(margin, y, pageWidth - margin * 2, 50, 6, 6, 'S');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(colors.textLight);
      doc.text('CURRENT MEDIAN SALARY', margin + 16, y + 18);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(colors.primary);
      doc.text(safeText(marketInsights.averageSalary), margin + 16, y + 40);

      // Trend note on right
      if (Array.isArray(marketInsights.trends) && marketInsights.trends[0]) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(colors.textLight);
        const trendLines = doc.splitTextToSize(marketInsights.trends[0], 200);
        doc.text(trendLines, pageWidth - margin - 210, y + 22);
      }
      y += 62;
    }

    // Salary trend line chart
    if (Array.isArray(marketInsights.salarySeries) && marketInsights.salarySeries.length) {
      const years = marketInsights.salarySeries.map(s => s.year);
      const medians = marketInsights.salarySeries.map(s => s.median);
      const p90s = marketInsights.salarySeries.map(s => s.p90 || null);
      const p10s = marketInsights.salarySeries.map(s => s.p10 || null);

      const datasets = [
        { label: 'Median', data: medians, borderColor: colors.accent, backgroundColor: 'rgba(0,201,167,0.08)', fill: true, borderWidth: 2.5, pointRadius: 3 },
      ];
      if (p90s[0]) datasets.push({ label: '90th Percentile', data: p90s, borderColor: colors.primary, borderDash: [5, 3], borderWidth: 1.5, pointRadius: 0, fill: false });
      if (p10s[0]) datasets.push({ label: '10th Percentile', data: p10s, borderColor: colors.textLight, borderDash: [3, 3], borderWidth: 1, pointRadius: 0, fill: false });

      const salaryImg = renderChartToImage({
        type: 'line',
        data: { labels: years, datasets },
        options: {
          scales: { y: { grid: { color: '#E2E8F0' } }, x: { grid: { display: false } } },
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } }
        }
      }, 900, 320);

      ensureSpace(230);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(colors.dark);
      doc.text('Salary Trend (2015–2026)', margin, y + 10);
      y += 18;
      doc.addImage(salaryImg, 'PNG', margin, y, pageWidth - margin * 2, 180);
      y += 192;
    }

    // Viability Radar
    if (Array.isArray(marketInsights.viability) && marketInsights.viability.length) {
      ensureSpace(300);
      drawSectionTitle('Career Viability Index', '5-dimension analysis of long-term career health');

      const vLabels = marketInsights.viability.map(v => v.label.replace('AI Displacement Risk', 'AI Resilience'));
      const vValues = marketInsights.viability.map(v => v.id === 'ai-displacement' ? (100 - v.value) : v.value);

      const viabilityImg = renderChartToImage({
        type: 'radar',
        data: {
          labels: vLabels,
          datasets: [{
            label: 'Viability Score',
            data: vValues,
            backgroundColor: 'rgba(11, 61, 145, 0.12)',
            borderColor: colors.primary,
            borderWidth: 2,
            pointBackgroundColor: colors.primary,
            pointRadius: 5,
          }]
        },
        options: {
          scales: { r: { min: 0, max: 100, ticks: { stepSize: 20, font: { size: 9 } } } },
          plugins: { legend: { display: false } }
        }
      }, 600, 400);

      const radarW = 260;
      doc.addImage(viabilityImg, 'PNG', (pageWidth - radarW) / 2, y, radarW, 200);
      y += 210;

      // Viability table
      ensureSpace(100);
      autoTable(doc, {
        startY: y,
        head: [['Dimension', 'Score', 'Trend', 'Assessment']],
        body: marketInsights.viability.map(v => {
          const score = v.id === 'ai-displacement' ? (100 - v.value) : v.value;
          const assessment = score >= 75 ? 'Strong' : score >= 50 ? 'Moderate' : 'At Risk';
          const trendIcon = v.trend === 'up' ? '↑' : v.trend === 'down' ? '↓' : '→';
          return [v.label, `${score}/100`, `${trendIcon} ${v.trend}`, assessment];
        }),
        theme: 'striped',
        styles: { fontSize: 9, textColor: colors.text, cellPadding: 7 },
        headStyles: { fillColor: colors.primaryDark, textColor: colors.white },
        alternateRowStyles: { fillColor: '#F8FAFC' },
        margin: { left: margin, right: margin },
      });
      y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 16 : y + 100;
    }

    // ===== ACHIEVEMENTS & BADGES =====
    doc.addPage();
    y = 50;
    drawPageHeader();
    drawSectionTitle('Achievements & Badges', 'Your exploration milestones and accomplishments');

    const earnedBadges = (progress.badges || []);
    const allBadges = badges || [];

    if (allBadges.length) {
      autoTable(doc, {
        startY: y,
        head: [['Badge', 'Name', 'Description', 'Status']],
        body: allBadges.map(b => {
          const earned = earnedBadges.some(eb => eb.id === b.id);
          return [badgeLabelMap[b.icon] || 'Badge', b.name, b.description, earned ? 'Earned' : 'Locked'];
        }),
        theme: 'striped',
        styles: { fontSize: 9, textColor: colors.text, cellPadding: 8 },
        headStyles: { fillColor: colors.primaryDark, textColor: colors.white },
        alternateRowStyles: { fillColor: '#F8FAFC' },
        columnStyles: {
          0: { cellWidth: 30, halign: 'center' },
          3: { fontStyle: 'bold' }
        },
        margin: { left: margin, right: margin },
        didParseCell: (data) => {
          if (data.column.index === 3 && data.section === 'body') {
            const earned = data.cell.raw.includes('Earned');
            data.cell.styles.textColor = earned ? colors.success : colors.textLight;
          }
        }
      });
      y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 20 : y + 100;
    }

    // Badge completion chart
    const earnedCount = earnedBadges.length;
    const totalCount = allBadges.length;
    if (totalCount > 0) {
      ensureSpace(200);
      const completionImg = renderChartToImage({
        type: 'doughnut',
        data: {
          labels: ['Earned', 'Remaining'],
          datasets: [{
            data: [earnedCount, totalCount - earnedCount],
            backgroundColor: [colors.accent, '#E2E8F0'],
            borderWidth: 0,
          }]
        },
        options: {
          cutout: '65%',
          plugins: { legend: { position: 'bottom' } }
        }
      }, 400, 400);

      const doughnutW = 160;
      doc.addImage(completionImg, 'PNG', (pageWidth - doughnutW) / 2, y, doughnutW, 140);
      y += 150;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(colors.primary);
      doc.text(`${earnedCount} of ${totalCount} badges earned (${Math.round(earnedCount / totalCount * 100)}%)`, pageWidth / 2, y, { align: 'center' });
      y += 24;
    }

    // ===== DECISION HISTORY =====
    if (Array.isArray(progress.decisions) && progress.decisions.length) {
      ensureSpace(100);
      drawSectionTitle('Decision History', 'Your career exploration choices and XP earned');

      autoTable(doc, {
        startY: y,
        head: [['#', 'Career', 'Decision', 'XP Earned']],
        body: progress.decisions.slice(-15).map((d, i) => [
          String(i + 1),
          safeText(d.careerTitle),
          safeText(d.choice),
          `+${d.xp || 0} XP`
        ]),
        theme: 'striped',
        styles: { fontSize: 8, textColor: colors.text, cellPadding: 6 },
        headStyles: { fillColor: colors.primaryDark, textColor: colors.white },
        alternateRowStyles: { fillColor: '#F8FAFC' },
        columnStyles: { 0: { cellWidth: 25 }, 3: { cellWidth: 55, halign: 'center' } },
        margin: { left: margin, right: margin },
      });
      y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 16 : y + 80;

      // XP distribution by career
      const xpByCareer = {};
      progress.decisions.forEach(d => {
        const key = d.careerTitle || 'Unknown';
        xpByCareer[key] = (xpByCareer[key] || 0) + (d.xp || 0);
      });
      const xpLabels = Object.keys(xpByCareer);
      const xpValues = Object.values(xpByCareer);

      if (xpLabels.length > 1) {
        ensureSpace(200);
        const xpImg = renderChartToImage({
          type: 'pie',
          data: {
            labels: xpLabels,
            datasets: [{
              data: xpValues,
              backgroundColor: [colors.accent, colors.primary, colors.accentAmber, colors.success, '#8B5CF6', '#EC4899'],
              borderWidth: 2,
              borderColor: colors.white,
            }]
          },
          options: { plugins: { legend: { position: 'right', labels: { font: { size: 11 } } } } }
        }, 700, 350);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(colors.dark);
        doc.text('XP Distribution by Career Path', margin, y + 10);
        y += 18;
        doc.addImage(xpImg, 'PNG', margin, y, pageWidth - margin * 2, 160);
        y += 172;
      }
    }

    // ===== RECOMMENDATIONS & NEXT STEPS =====
    doc.addPage();
    y = 50;
    drawPageHeader();
    drawSectionTitle('Recommendations & Next Steps', 'Personalized action items based on your exploration');

    // Generate smart recommendations based on data
    const recommendations = [];
    if (matches.length > 0) {
      recommendations.push(`Focus on ${matches[0].role} — your strongest match at ${matches[0].score}% compatibility.`);
    }
    if (marketInsights.averageSalary) {
      recommendations.push(`Current median salary for your top match: ${marketInsights.averageSalary}. Target the 75th percentile through specialization.`);
    }
    if (Array.isArray(marketInsights.viability) && marketInsights.viability.length) {
      const weakest = [...marketInsights.viability].sort((a, b) => a.value - b.value)[0];
      if (weakest) {
        recommendations.push(`Strengthen your position in "${weakest.label}" (currently ${weakest.value}/100) through targeted skill development.`);
      }
    }
    recommendations.push('Complete remaining career scenarios to unlock deeper insights and earn badges.');
    recommendations.push('Revisit the Market Intelligence dashboard monthly to track evolving trends.');
    if (Array.isArray(actionPlan.skills) && actionPlan.skills.length) {
      const lowestSkill = [...actionPlan.skills].sort((a, b) => (a.level || 0) - (b.level || 0))[0];
      if (lowestSkill) {
        recommendations.push(`Prioritize improving "${lowestSkill.name}" — your current lowest-rated skill area.`);
      }
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colors.text);
    recommendations.forEach((rec, i) => {
      ensureSpace(40);
      doc.setFillColor(i % 2 === 0 ? '#F0FDF9' : '#F8FAFC');
      doc.roundedRect(margin, y - 4, pageWidth - margin * 2, 28, 4, 4, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(colors.accent);
      doc.text(`${i + 1}.`, margin + 8, y + 12);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(colors.text);
      const lines = doc.splitTextToSize(rec, pageWidth - margin * 2 - 40);
      doc.text(lines, margin + 24, y + 12);
      y += 32;
    });

    y += 20;

    // Closing summary box
    ensureSpace(80);
    doc.setFillColor(colors.primaryDark);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 60, 6, 6, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colors.white);
    doc.text('Your STEM Journey Continues', margin + 16, y + 22);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#94A3B8');
    doc.text('This report is a snapshot of your current exploration. Return to the platform to unlock', margin + 16, y + 38);
    doc.text('new scenarios, earn badges, and track real-time market shifts in your chosen field.', margin + 16, y + 50);

    // ===== PORTFOLIO =====
    doc.addPage();
    y = 50;
    drawPageHeader();
    drawSectionTitle('Portfolio', 'Projects completed on your SkillBridge roadmap');

    const portfolioList = Array.isArray(portfolio) ? portfolio : [];
    if (portfolioList.length === 0) {
      ensureSpace(40);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(colors.textLight);
      doc.text('No projects completed yet', margin, y + 4);
      y += 24;
    } else {
      const sortedPortfolio = [...portfolioList].sort(
        (a, b) => safeText(b && b.completedAt).localeCompare(safeText(a && a.completedAt))
      );

      const formatCompletedAt = (iso) => {
        const s = safeText(iso);
        if (!s) return '';
        const d = new Date(s);
        if (Number.isNaN(d.getTime())) return s;
        return d.toLocaleDateString();
      };

      autoTable(doc, {
        startY: y,
        head: [['Title', 'Skills', 'Difficulty', 'Completed', 'Notes']],
        body: sortedPortfolio.map((entry) => {
          const skills = Array.isArray(entry && entry.skills) ? entry.skills.join(', ') : '';
          const notesParts = [];
          if (entry && entry.notes) notesParts.push(safeText(entry.notes));
          if (entry && entry.url) notesParts.push(safeText(entry.url));
          return [
            safeText(entry && (entry.title || entry.projectId)) || 'Untitled project',
            skills,
            safeText(entry && entry.difficulty),
            formatCompletedAt(entry && entry.completedAt),
            notesParts.join(' — '),
          ];
        }),
        theme: 'striped',
        styles: { fontSize: 9, textColor: colors.text, cellPadding: 7, overflow: 'linebreak' },
        headStyles: { fillColor: colors.primaryDark, textColor: colors.white },
        alternateRowStyles: { fillColor: '#F8FAFC' },
        columnStyles: {
          0: { cellWidth: 110 },
          2: { cellWidth: 60, halign: 'center' },
          3: { cellWidth: 70, halign: 'center' },
        },
        margin: { left: margin, right: margin },
      });
      y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 16 : y + 80;
    }

    // ===== FOOTER ON ALL PAGES =====
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      const footerY = pageHeight - 28;
      // Footer line
      doc.setDrawColor('#E2E8F0');
      doc.setLineWidth(0.5);
      doc.line(margin, footerY - 10, pageWidth - margin, footerY - 10);
      // Footer text
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor('#94A3B8');
      doc.text('STEM Career Explorer • Career Intelligence Report • Confidential', margin, footerY);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin - 50, footerY);
    }

    doc.save(`${userName.replace(/\s+/g, '_')}_STEM_Career_Report.pdf`);
  };

  return (
    <button
      onClick={generatePDF}
      title="Download comprehensive career report"
      className="download-btn"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v12m0 0l4-4m-4 4-4-4M21 21H3" />
      </svg>
      <span>Download Career Report</span>
    </button>
  );
}
