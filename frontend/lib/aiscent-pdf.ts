export async function downloadAiscentPdf(
  el: HTMLElement,
  fileName = `aiscent-ascent-position-${Date.now()}.pdf`,
) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ]);

  const hidden = Array.from(
    el.querySelectorAll<HTMLElement>('[data-pdf-hide="true"]'),
  );
  const prev = hidden.map((n) => n.style.display);
  hidden.forEach((n) => (n.style.display = 'none'));

  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#F7F5F1',
      useCORS: true,
      logging: false,
      windowWidth: el.scrollWidth,
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    let heightLeft = imgH;
    let position = 0;
    const imgData = canvas.toDataURL('image/png');

    pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      position = heightLeft - imgH;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
      heightLeft -= pageH;
    }

    pdf.save(fileName);
  } finally {
    hidden.forEach((n, i) => (n.style.display = prev[i]));
  }
}
