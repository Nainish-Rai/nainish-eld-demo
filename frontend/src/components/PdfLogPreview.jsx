import { useEffect, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { Alert, Box, Button, ButtonGroup, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export function PdfLogPreview({ pdfBytes }) {
  const theme = useTheme();
  const containerRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);

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
        setPageCount(pdf.numPages);

        const boundedPageNumber = Math.min(Math.max(pageNumber, 1), pdf.numPages);
        if (boundedPageNumber !== pageNumber) {
          setPageNumber(boundedPageNumber);
          return;
        }

        if (isCancelled) {
          return;
        }

        const page = await pdf.getPage(boundedPageNumber);
        const cssScale = zoom;
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
        canvas.style.background = theme.planner.canvasBackground;
        canvas.style.border = theme.planner.canvasBorder;
        canvas.style.boxShadow = theme.planner.canvasShadow;
        canvas.style.flex = "0 0 auto";

        container.appendChild(canvas);
        await page.render({ canvasContext: context, viewport: renderViewport }).promise;

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
  }, [pageNumber, pdfBytes, theme, zoom]);

  function goToPreviousPage() {
    setPageNumber((current) => Math.max(1, current - 1));
  }

  function goToNextPage() {
    setPageNumber((current) => Math.min(pageCount || current + 1, current + 1));
  }

  function zoomOut() {
    setZoom((current) => Math.max(0.7, Number((current - 0.1).toFixed(1))));
  }

  function zoomIn() {
    setZoom((current) => Math.min(1.8, Number((current + 0.1).toFixed(1))));
  }

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
    <Stack spacing={1.25} sx={{ height: "100%", minHeight: 0 }}>
      <Paper
        elevation={0}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          p: 1,
          border: (currentTheme) => currentTheme.planner.panelBorder,
          bgcolor: "background.paper",
          borderRadius: "18px",
          flex: "0 0 auto",
        }}
      >
        <ButtonGroup size="small" variant="outlined">
          <Button onClick={goToPreviousPage} disabled={pageNumber <= 1 || status === "loading"}>
            Back
          </Button>
          <Button onClick={goToNextPage} disabled={!pageCount || pageNumber >= pageCount || status === "loading"}>
            Next
          </Button>
        </ButtonGroup>

        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {pageCount ? `${pageNumber} of ${pageCount}` : "Loading"}
        </Typography>

        <ButtonGroup size="small" variant="outlined">
          <Button onClick={zoomOut} disabled={zoom <= 0.7 || status === "loading"}>
            -
          </Button>
          <Button disabled>{Math.round(zoom * 100)}%</Button>
          <Button onClick={zoomIn} disabled={zoom >= 1.8 || status === "loading"}>
            +
          </Button>
        </ButtonGroup>
      </Paper>

      <Box sx={{ position: "relative", flex: "1 1 0", minHeight: 0 }}>
        {status === "loading" ? (
          <CircularProgress size={22} sx={{ position: "absolute", top: 16, left: 16, zIndex: 2 }} />
        ) : null}
        <Box
          ref={containerRef}
          sx={{
            height: "100%",
            width: "100%",
            minWidth: 0,
            p: { xs: 1.5, md: 3 },
            bgcolor: (currentTheme) => currentTheme.planner.previewBackground,
            overflow: "auto",
            display: "flex",
            justifyContent: "flex-start",
            border: (currentTheme) => currentTheme.planner.panelBorder,
            borderRadius: "22px",
            "& canvas": {
              mx: "auto",
            },
          }}
        />
      </Box>
    </Stack>
  );
}
