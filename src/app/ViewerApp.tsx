import "./ViewerApp.scss";
import {
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ClearAllRoundedIcon from "@mui/icons-material/ClearAllRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import IosShareRoundedIcon from "@mui/icons-material/IosShareRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import { useEffect, useMemo, useRef, useState } from "react";

import { useViewerAppContext, ViewerAppProvider } from "./context/ViewerAppContext";
import type { ViewerAppOptions } from "./hooks/useViewerAppController";
import { useAppThemeMode } from "./providers/AppProviders";
import { ChatPanel } from "../components/chat";
import { FileDropzone } from "../components/viewer";

const DEFAULT_SPLIT_PERCENT = 62;
const MIN_SPLIT_PERCENT = 35;
const MAX_SPLIT_PERCENT = 70;

export function ViewerApp(options: ViewerAppOptions) {
  return (
    <ViewerAppProvider {...options}>
      <ViewerAppLayout />
    </ViewerAppProvider>
  );
}

function ViewerAppLayout() {
  const controller = useViewerAppContext();
  const theme = useTheme();
  const { mode, toggleColorMode } = useAppThemeMode();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const isResizingRef = useRef(false);
  const [splitPercent, setSplitPercent] = useState(DEFAULT_SPLIT_PERCENT);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent): void {
      if (!isResizingRef.current) {
        return;
      }

      const shell = shellRef.current;
      if (!shell) {
        return;
      }

      const rect = shell.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }

      const nextPercent = ((event.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(clampSplitPercent(Math.round(nextPercent)));
    }

    function handleMouseUp(): void {
      isResizingRef.current = false;
      setIsResizing(false);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const surfaceStyles = useMemo(
    () => ({
      borderColor: theme.palette.divider,
      backgroundColor:
        mode === "dark"
          ? alpha(theme.palette.background.paper, 0.94)
          : alpha(theme.palette.background.paper, 0.98),
      boxShadow:
        mode === "dark"
          ? "0 14px 32px rgba(15, 23, 42, 0.22)"
          : "0 12px 24px rgba(148, 163, 184, 0.14)",
      backdropFilter: "blur(10px)",
    }),
    [mode, theme],
  );

  const viewportPanelStyles = useMemo(
    () => ({
      ...surfaceStyles,
      background:
        mode === "dark"
          ? "linear-gradient(180deg, rgba(15, 23, 37, 0.98), rgba(17, 24, 39, 0.99))"
          : "linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(241, 245, 249, 0.97))",
    }),
    [mode, surfaceStyles],
  );

  return (
    <Box
      ref={shellRef}
      className="app-shell app-shell--with-chat"
      data-app-shell="true"
      data-color-mode={mode}
      sx={{
        gridTemplateColumns: {
          xs: "1fr",
          lg: `minmax(0, calc(${splitPercent}% - 8px)) 16px minmax(320px, calc(${100 - splitPercent}% - 8px))`,
        },
        userSelect: isResizing ? "none" : "auto",
      }}
    >
      <a className="skip-link" href="#workspace-main">
        跳转到主内容
      </a>
      <Box className="app-main">
        <Paper
          component="header"
          className="topbar"
          sx={surfaceStyles}
        >
          <Stack className="topbar__intro" spacing={0.5}>
            <Typography component="h1" variant="h5">
              STL Web 预览器
            </Typography>
            <Typography variant="body2" color="text.secondary">
              导入 `.stl` 后开始预览、选区和协作。
            </Typography>
          </Stack>
          <Stack
            className="topbar__actions"
            direction={{ xs: "column", md: "row" }}
            spacing={1}
          >
            <Paper
              className={`file-meta${controller.fileMeta ? "" : " is-hidden"}`}
              data-file-meta="true"
              sx={{
                display: controller.fileMeta ? "inline-flex" : "none",
                alignItems: "center",
                gap: 1.5,
                px: 1.5,
                py: 1,
                minWidth: 0,
                border: 0,
                background:
                  mode === "dark"
                    ? `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.14)}, ${alpha(theme.palette.background.paper, 0.94)})`
                    : `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.08)}, ${alpha(theme.palette.background.paper, 0.98)})`,
                boxShadow:
                  mode === "dark"
                    ? "inset 0 1px 0 rgba(255,255,255,0.03), 0 8px 22px rgba(15, 23, 42, 0.18)"
                    : "0 8px 20px rgba(148, 163, 184, 0.14)",
              }}
            >
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: 1.5,
                  display: "grid",
                  placeItems: "center",
                  bgcolor: alpha(theme.palette.primary.main, mode === "dark" ? 0.14 : 0.1),
                  color: "primary.main",
                  flex: "0 0 auto",
                }}
              >
                <DescriptionOutlinedIcon fontSize="small" />
              </Box>
              <Box className="file-meta__text">
                <Typography
                  className="file-meta__name"
                  data-file-meta-name="true"
                  variant="body2"
                  sx={{ fontWeight: 600 }}
                >
                  {controller.fileMeta?.name ?? ""}
                </Typography>
                <Typography
                  className="file-meta__path"
                  data-file-meta-path="true"
                  title={controller.fileMeta?.modelPath ?? controller.fileMeta?.detail ?? ""}
                  variant="caption"
                  color="text.secondary"
                >
                  {controller.fileMeta?.detail ?? ""}
                </Typography>
              </Box>
              <Button
                className={`file-meta__copy${controller.fileMeta?.modelPath ? "" : " is-hidden"}`}
                type="button"
                variant="text"
                color="inherit"
                size="small"
                startIcon={<ContentCopyRoundedIcon fontSize="small" />}
                data-copy-model-path="true"
                disabled={!controller.fileMeta?.modelPath}
                onClick={() => {
                  void controller.handleCopyModelPath();
                }}
              >
                复制路径
              </Button>
            </Paper>
            <Tooltip title={mode === "dark" ? "切换到浅色模式" : "切换到深色模式"}>
              <IconButton
                color="inherit"
                size="small"
                data-theme-toggle="true"
                onClick={toggleColorMode}
                aria-label={mode === "dark" ? "切换到浅色模式" : "切换到深色模式"}
                sx={{
                  border: `1px solid ${theme.palette.divider}`,
                  backgroundColor: alpha(theme.palette.background.paper, 0.62),
                }}
              >
                {mode === "dark" ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
              </IconButton>
            </Tooltip>
            <Button
              type="button"
              variant="contained"
              startIcon={<UploadFileRoundedIcon />}
              size="large"
              data-pick-file="true"
              onClick={controller.handlePickFile}
            >
              导入 STL
            </Button>
          </Stack>
          <input
            ref={controller.fileInputRef}
            type="file"
            accept=".stl"
            hidden
            data-file-input="true"
            onChange={controller.handleFileInputChange}
          />
        </Paper>

        <Box className="workspace-shell" id="workspace-main">
          <Box component="main" className="viewer-layout">
            <Paper
              component="section"
              className={`viewport-panel${
                controller.viewportLoaded ? " is-loaded" : ""
              }${controller.isDragActive ? " is-drag-active" : ""}`}
              data-viewport-panel="true"
              sx={viewportPanelStyles}
              onDragOver={controller.handleViewportDragOver}
              onDragLeave={controller.handleViewportDragLeave}
              onDrop={controller.handleViewportDrop}
            >
              <Box
                ref={controller.viewportHostRef}
                className="viewport-host"
                data-viewport-host="true"
              />
              <Box
                className={`viewport-empty${
                  controller.viewportLoaded ? " is-hidden" : ""
                }`}
                data-empty-state="true"
              >
                <Paper className="empty-state" variant="outlined">
                  <Box
                    sx={{
                      width: 52,
                      height: 52,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      bgcolor: alpha(theme.palette.primary.main, 0.14),
                      color: "primary.main",
                    }}
                  >
                    <UploadFileRoundedIcon />
                  </Box>
                  <Typography component="h2" variant="h6">
                    拖拽 STL 文件到这里开始预览
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    或者使用上方按钮导入模型，随后就能在当前选区上发起协作。
                  </Typography>
                </Paper>
              </Box>
              {controller.errorMessage ? (
                <Box className="viewport-error" data-error-text="true">
                  <Typography variant="body2" color="error.contrastText">
                    {controller.errorMessage}
                  </Typography>
                </Box>
              ) : null}
              <Box data-dropzone-root="true">
                <FileDropzone />
              </Box>
              <Box
                ref={controller.orientationRootRef}
                className="orientation-anchor"
                data-orientation-root="true"
              />
            </Paper>

            <Paper
              component="footer"
              className="viewer-toolbar"
              aria-label="画布操作"
              sx={surfaceStyles}
            >
              <Typography
                className="selection-status"
                data-selection-status="true"
                variant="body2"
                color="text.secondary"
              >
                <InfoOutlinedIcon fontSize="inherit" style={{ marginRight: 8 }} />
                {controller.selectionStatusText}
              </Typography>
              <Stack
                className="viewer-toolbar__actions"
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
              >
                <Button
                  type="button"
                  variant="text"
                  color="inherit"
                  startIcon={<RestartAltRoundedIcon />}
                  data-reset-view="true"
                  onClick={controller.handleResetView}
                >
                  重置视角
                </Button>
                <Button
                  type="button"
                  variant="text"
                  color="inherit"
                  startIcon={<IosShareRoundedIcon />}
                  data-export-context="true"
                  onClick={controller.handleExportContext}
                >
                  导出上下文
                </Button>
                <Button
                  type="button"
                  variant="text"
                  color="inherit"
                  startIcon={<ClearAllRoundedIcon />}
                  data-clear-selection="true"
                  onClick={controller.handleClearSelection}
                >
                  清空选择
                </Button>
              </Stack>
            </Paper>
          </Box>
        </Box>
      </Box>

      <Box
        role="separator"
        tabIndex={0}
        aria-label="调整聊天面板宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_SPLIT_PERCENT}
        aria-valuemax={MAX_SPLIT_PERCENT}
        aria-valuenow={splitPercent}
        className={`app-shell__divider${isResizing ? " is-active" : ""}`}
        data-split-resizer="true"
        onMouseDown={(event) => {
          event.preventDefault();
          isResizingRef.current = true;
          setIsResizing(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            setSplitPercent((current) => clampSplitPercent(current - 2));
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            setSplitPercent((current) => clampSplitPercent(current + 2));
          }
        }}
      >
        <span className="app-shell__divider-handle" />
      </Box>

      <Box className="chat-slot" data-chat-slot="true">
        <ChatPanel
          state={controller.chatState}
          handlers={{
            onSend: controller.handleSendMessage,
            onGenerateModel: controller.handleGenerateModel,
            onInterrupt: controller.handleInterruptTurn,
            onClearSession: controller.handleClearSession,
            onDecision: controller.handleDecision,
          }}
        />
      </Box>
    </Box>
  );
}

function clampSplitPercent(value: number): number {
  return Math.min(MAX_SPLIT_PERCENT, Math.max(MIN_SPLIT_PERCENT, value));
}
