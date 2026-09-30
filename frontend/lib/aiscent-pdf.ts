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
    // Prefer explicit `data-pdf-block="true"` blocks; fall back to the direct
    // children of the content root. Rendering each block into its own canvas
    // (rather than one giant canvas sliced by pixel offset) is what prevents
    // an element from being cut in half at a page boundary.
    const explicit = Array.from(
      el.querySelectorAll<HTMLElement>('[data-pdf-block="true"]'),
    );
    const blocks: HTMLElement[] =
      explicit.length > 0
        ? explicit
        : Array.from(el.children).filter(
            (c): c is HTMLElement => c instanceof HTMLElement,
          );

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    // Page geometry. marginX in particular defends against the "text squished
    // to the left edge" bug — every image is drawn at x=marginX with a
    // reduced printableW so blocks never span the physical page width.
    const marginX = 12;
    const marginTop = 12;
    const marginBottom = 10;
    const printableW = pageW - marginX * 2;
    const printableH = pageH - marginTop - marginBottom;

    // baseGap = minimum gap between consecutive blocks on the same page.
    // maxGap = ceiling for distributed slack so a lightly-packed non-last
    // page doesn't produce absurdly stretched inter-block gaps.
    const baseGap = 4;
    const maxGap = 24;

    // scale 1.5 (was 2) and JPEG 0.85 (was lossless PNG) together shrink the
    // typical output from ~20MB to ~2-4MB with visually indistinguishable
    // quality on the AscentPosition layout.
    const SCALE = 1.5;
    const IMG_TYPE = 'JPEG' as const;
    const JPEG_Q = 0.85;

    type PageItem = { dataUrl: string; height: number };
    let pageBuf: PageItem[] = [];
    let pageHeightSum = 0; // sum of block heights only, no gaps
    let firstPage = true;

    const wouldOverflow = (imgH: number): boolean => {
      const gapCount = pageBuf.length; // one gap after each existing block
      return pageHeightSum + imgH + baseGap * gapCount > printableH;
    };

    const flushPage = (isLast: boolean) => {
      if (pageBuf.length === 0) return;
      if (!firstPage) pdf.addPage();
      firstPage = false;

      const n = pageBuf.length;
      // Distribute leftover only on non-last pages with 2+ blocks. Last page
      // uses baseGap so a lightly-populated final page doesn't get stretched.
      let gap = baseGap;
      if (!isLast && n >= 2) {
        const slack = printableH - pageHeightSum;
        const distributed = slack / (n - 1);
        gap = Math.min(Math.max(distributed, baseGap), maxGap);
      }

      let y = marginTop;
      for (const item of pageBuf) {
        pdf.addImage(
          item.dataUrl,
          IMG_TYPE,
          marginX,
          y,
          printableW,
          item.height,
          undefined,
          'FAST',
        );
        y += item.height + gap;
      }
      pageBuf = [];
      pageHeightSum = 0;
    };

    for (const block of blocks) {
      // Skip zero-area blocks (safety net for the fallback direct-children path).
      if (!block.offsetParent && block.offsetHeight === 0) continue;

      const canvas = await html2canvas(block, {
        scale: SCALE,
        backgroundColor: '#F7F5F1',
        useCORS: true,
        logging: false,
        windowWidth: el.scrollWidth,
      });
      if (canvas.width === 0 || canvas.height === 0) continue;

      const imgW = printableW;
      const imgH = (canvas.height * imgW) / canvas.width;
      const dataUrl = canvas.toDataURL('image/jpeg', JPEG_Q);

      if (imgH > printableH) {
        // Rare: single block taller than a full page. Flush current buffer,
        // then bitmap-slice this block across pages. No distribution — the
        // slice fills each page naturally.
        flushPage(false);
        if (!firstPage) pdf.addPage();
        firstPage = false;
        let heightLeft = imgH;
        let position = marginTop;
        pdf.addImage(dataUrl, IMG_TYPE, marginX, position, imgW, imgH, undefined, 'FAST');
        heightLeft -= printableH;
        while (heightLeft > 0) {
          position = marginTop + (heightLeft - imgH);
          pdf.addPage();
          pdf.addImage(dataUrl, IMG_TYPE, marginX, position, imgW, imgH, undefined, 'FAST');
          heightLeft -= printableH;
        }
        continue;
      }

      if (wouldOverflow(imgH)) flushPage(false);
      pageBuf.push({ dataUrl, height: imgH });
      pageHeightSum += imgH;
    }

    flushPage(true);

    pdf.save(fileName);
  } finally {
    hidden.forEach((n, i) => (n.style.display = prev[i]));
  }
}
