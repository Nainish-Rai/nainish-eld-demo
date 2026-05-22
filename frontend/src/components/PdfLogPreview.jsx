import { useEffect, useRef, useState } from "react";
import { Alert, Box, CircularProgress, Stack } from "@mui/material";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export function PdfLogPreview({ pdfBytes }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!pdfBytes || !containerRef.current) {
      return undefined;
    }

    let isCancelled = false;
    const container = containerRef.current;
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });

    async function renderPdf() {
      setStatus("loading");
      setErrorMessage("");
      container.replaceChildren();

      try {
        const pdf = await loadingTask.promise;
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (isCancelled) {
            return;
          }

          const page = await pdf.getPage(pageNumber);
          const cssScale = 1;
          const pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
          const viewport = page.getViewport({ scale: cssScale });
          const renderViewport = page.getViewport({ scale: cssScale * pixelRatio });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.width = renderViewport.width;
          canvas.height = renderViewport.height;
          canvas.style.display = "block";
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          canvas.style.background = "#ffffff";
          canvas.style.border = "1px solid rgba(24,38,31,0.12)";
          canvas.style.boxShadow = "0 14px 32px rgba(24,38,31,0.12)";
          canvas.style.flex = "0 0 auto";

          if (pageNumber > 1) {
            canvas.style.marginTop = "16px";
          }

          container.appendChild(canvas);
          await page.render({ canvasContext: context, viewport: renderViewport }).promise;
        }

        if (!isCancelled) {
          setStatus("ready");
        }
      } catch (error) {
        if (!isCancelled) {
          setStatus("error");
          setErrorMessage(error instanceof Error ? error.message : "Unable to render the PDF preview.");
        }
      }
    }

    renderPdf();

    return () => {
      isCancelled = true;
      loadingTask.destroy();
      container.replaceChildren();
    };
  }, [pdfBytes]);

  if (!pdfBytes) {
    return (
      <Box sx={{ minHeight: 360, display: "grid", placeItems: "center" }}>
        <CircularProgress size={26} />
      </Box>
    );
  }

  if (status === "error") {
    return <Alert severity="error">{errorMessage}</Alert>;
  }

  return (
    <Stack spacing={2}>
      {status === "loading" ? <CircularProgress size={22} /> : null}
      <Box
        ref={containerRef}
        sx={{
          width: "100%",
          minWidth: 0,
          p: { xs: 2, md: 4 },
          bgcolor: "#f5f2ea",
          overflow: "auto",
          display: "flex",
          justifyContent: "flex-start",
          "& canvas": {
            mx: "auto",
          },
        }}
      />
    </Stack>
  );
}
