import { useEffect, useMemo, useRef, useState } from "react";
import shakalPng from "./assets/shakal.png";
import { DegradationControls } from "./components/DegradationControls";
import { EffectsPanel } from "./components/EffectsPanel";
import { DEFAULT_EFFECTS, type EffectOptions } from "./lib/effects";
import {
	generateMeterPreviews,
	type MeterPreviewTile,
} from "./lib/meterPreviews";
import {
	DEFAULT_INTENSITY,
	formatIntensityLabel,
	getIntensitySettings,
	intensityToMeterStage,
	INTENSITY_MAX,
	METER_STAGES,
	meterStageToIntensity,
	type DegradationSettings,
} from "./lib/processing";
import { formatBytes, shakalify, type ShakalStats } from "./lib/shakalify";
import "./App.css";
const SHAKAL = shakalPng,
	LIVE_DEBOUNCE_MS = 280;
const STAGES = Array.from({ length: METER_STAGES }, (_, index) => ({
	stage: index + 1,
	intensity: meterStageToIntensity(index + 1),
}));
function ShakalMeter({
	value,
	manual,
	onChange,
}: {
	value: number;
	manual: boolean;
	onChange: (intensity: number) => void;
}) {
	const [previews, setPreviews] = useState<MeterPreviewTile[] | null>(null);
	useEffect(() => {
		let cancelled = false;
		generateMeterPreviews(SHAKAL)
			.then((tiles) => {
				if (!cancelled) setPreviews(tiles);
			})
			.catch(() => {
				/* Numeric stage buttons remain available. */
			});
		return () => {
			cancelled = true;
		};
	}, []);
	const activeStage = intensityToMeterStage(value);
	return (
		<div className="meter">
			<div className="meter-header">
				<span className="meter-label">Степень шакалинга</span>
				<span className="meter-value">
					{manual ? "Вручную" : formatIntensityLabel(value)}
				</span>
			</div>
			<input
				type="range"
				className="meter-slider posterize-slider"
				min={0}
				max={INTENSITY_MAX}
				step={1}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				style={{ "--fill": `${value}%` } as React.CSSProperties}
				aria-label="Степень шакалинга"
				aria-valuetext={formatIntensityLabel(value)}
			/>
			<div className="meter-labels" aria-hidden="true">
				<span>0</span>
				<span>100</span>
			</div>
			<fieldset
				className="meter-grid"
				aria-label="Быстрый выбор степени шакалинга"
			>
				{STAGES.map(({ stage, intensity }) => (
					<button
						key={stage}
						type="button"
						className={`meter-tile ${!manual && activeStage === stage ? "meter-tile--active" : ""}`}
						onClick={() => onChange(intensity)}
						aria-label={`Уровень ${stage} (${formatIntensityLabel(intensity)})`}
						aria-pressed={!manual && activeStage === stage}
					>
						{previews ? (
							<img src={previews[stage - 1].src} alt="" draggable={false} />
						) : (
							<span className="meter-tile__fallback">{stage}</span>
						)}
					</button>
				))}
			</fieldset>
		</div>
	);
}
function ShakalMascot({
	className,
	alt = "Шакал",
}: {
	className?: string;
	alt?: string;
}) {
	return <img src={SHAKAL} alt={alt} className={className} draggable={false} />;
}
function ComparePreview({
	originalUrl,
	resultUrl,
}: {
	originalUrl: string;
	resultUrl: string;
}) {
	const [position, setPosition] = useState(50);
	return (
		<div className="compare">
			<div className="compare__frame">
				<img
					src={resultUrl}
					alt="Результат"
					className="compare__img compare__img--result"
				/>
				<img
					src={originalUrl}
					alt="Оригинал"
					className="compare__img compare__img--original"
					style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
				/>
				<div
					className="compare__handle"
					style={{ left: `${position}%` }}
					aria-hidden="true"
				/>
			</div>
			<input
				type="range"
				min={0}
				max={100}
				value={position}
				onChange={(e) => setPosition(Number(e.target.value))}
				className="compare__slider"
				aria-label="Сравнение до и после"
			/>
		</div>
	);
}
type Result = { url: string; blob: Blob; stats: ShakalStats };
type Outcome = { file: File; key: string; result?: Result; error?: string };
function App() {
	const [file, setFile] = useState<File | null>(null);
	const [originalUrl, setOriginalUrl] = useState<string | null>(null);
	const [intensity, setIntensity] = useState(DEFAULT_INTENSITY);
	const [manualSettings, setManualSettings] =
		useState<DegradationSettings | null>(null);
	const [effects, setEffects] = useState<EffectOptions>(DEFAULT_EFFECTS);
	const [pixelScale, setPixelScale] = useState(1),
		[exportPng, setExportPng] = useState(false);
	const [compareMode, setCompareMode] = useState(false),
		[dragOver, setDragOver] = useState(false);
	const [outcome, setOutcome] = useState<Outcome | null>(null);
	const [importError, setImportError] = useState<string | null>(null),
		[retry, setRetry] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const originalRef = useRef<string | null>(null),
		resultRef = useRef<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const settings = useMemo(
		() => manualSettings ?? getIntensitySettings(intensity),
		[manualSettings, intensity],
	);
	const processKey = JSON.stringify({
		intensity,
		settings,
		effects,
		pixelScale,
		exportPng,
		retry,
	});
	const activeOutcome = outcome?.file === file ? outcome : null;
	const isProcessing = file !== null && activeOutcome?.key !== processKey;
	const result = activeOutcome?.result ?? null;
	const error = importError ?? (!isProcessing ? activeOutcome?.error : null);
	useEffect(
		() => () => {
			abortRef.current?.abort();
			if (originalRef.current) URL.revokeObjectURL(originalRef.current);
			if (resultRef.current) URL.revokeObjectURL(resultRef.current);
		},
		[],
	);
	useEffect(() => {
		if (!file) return;
		const controller = new AbortController();
		abortRef.current = controller;
		const timer = setTimeout(async () => {
			try {
				const processed = await shakalify(file, intensity, {
					settings,
					effects,
					pixelScale,
					exportPng,
					signal: controller.signal,
				});
				if (controller.signal.aborted) return;
				// Only accepted jobs allocate a preview URL. Aborted jobs return no URL.
				const url = URL.createObjectURL(processed.blob);
				if (resultRef.current) URL.revokeObjectURL(resultRef.current);
				resultRef.current = url;
				setOutcome({ file, key: processKey, result: { ...processed, url } });
			} catch (caught) {
				if (controller.signal.aborted) return;
				if (resultRef.current) URL.revokeObjectURL(resultRef.current);
				resultRef.current = null;
				setOutcome({
					file,
					key: processKey,
					error:
						caught instanceof Error
							? caught.message
							: "Не удалось обработать изображение. Попробуй ещё раз.",
				});
			}
		}, LIVE_DEBOUNCE_MS);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	}, [file, processKey, intensity, settings, effects, pixelScale, exportPng]);
	const handleFile = (incoming: File) => {
		if (incoming.size === 0) {
			setImportError("Файл пуст. Выбери другое изображение.");
			return;
		}
		if (
			!incoming.type.startsWith("image/") &&
			!(
				incoming.type === "" &&
				/\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(incoming.name)
			)
		) {
			setImportError("Выбери изображение: JPG, PNG, GIF или WEBP.");
			return;
		}
		abortRef.current?.abort();
		if (resultRef.current) URL.revokeObjectURL(resultRef.current);
		resultRef.current = null;
		if (originalRef.current) URL.revokeObjectURL(originalRef.current);
		const url = URL.createObjectURL(incoming);
		originalRef.current = url;
		setFile(incoming);
		setOriginalUrl(url);
		setOutcome(null);
		setImportError(null);
		setCompareMode(false);
	};
	const changeIntensity = (value: number) => {
		setIntensity(value);
		setManualSettings(null);
	};
	const download = () => {
		if (!result || !file || isProcessing) return;
		const a = document.createElement("a");
		a.href = result.url;
		a.download = `shakal_${file.name.replace(/\.[^.]+$/, "")}.${result.blob.type === "image/png" ? "png" : "jpg"}`;
		a.click();
	};
	const reset = () => {
		abortRef.current?.abort();
		if (resultRef.current) URL.revokeObjectURL(resultRef.current);
		resultRef.current = null;
		if (originalRef.current) URL.revokeObjectURL(originalRef.current);
		originalRef.current = null;
		setFile(null);
		setOriginalUrl(null);
		setOutcome(null);
		setImportError(null);
		setCompareMode(false);
		setDragOver(false);
	};
	return (
		<div className="app">
			<header className="header">
				<div className="header-inner">
					<ShakalMascot className="header-mascot" alt="" />
					<div className="header-text">
						<h1 className="title">
							ШАКАЛИФАЙ<span className="title-sub">shakalify</span>
						</h1>
					</div>
				</div>
			</header>
			<main className="main">
				<section className="panel">
					<input
						ref={inputRef}
						type="file"
						accept="image/*"
						hidden
						onChange={(e) => {
							const incoming = e.target.files?.[0];
							e.target.value = "";
							if (incoming) handleFile(incoming);
						}}
					/>
					{!file ? (
						<button
							type="button"
							className={`dropzone ${dragOver ? "dropzone--active" : ""}`}
							aria-label="Выбрать файл"
							onClick={() => inputRef.current?.click()}
							onDragOver={(e) => {
								e.preventDefault();
								setDragOver(true);
							}}
							onDragLeave={() => setDragOver(false)}
							onDrop={(e) => {
								e.preventDefault();
								setDragOver(false);
								const dropped = e.dataTransfer.files[0];
								if (dropped) handleFile(dropped);
							}}
						>
							<ShakalMascot className="dropzone-mascot" alt="" />
							<span className="dropzone-title">Перетащи изображение сюда</span>
							<span className="dropzone-hint">JPG · PNG · GIF · WEBP</span>
							<span className="btn btn--primary">Выбрать файл</span>
						</button>
					) : (
						<div className="workspace">
							{compareMode && result && originalUrl ? (
								<ComparePreview
									originalUrl={originalUrl}
									resultUrl={result.url}
								/>
							) : (
								<div className="preview-grid">
									<div className="preview-card">
										<div className="preview-label">
											<span>ДО</span>
											<span className="tag tag--muted">оригинал</span>
										</div>
										<div className="preview-frame">
											{originalUrl && (
												<img
													src={originalUrl}
													alt="Оригинал"
													className="preview-img"
												/>
											)}
										</div>
									</div>
									<div className="preview-divider" aria-hidden="true">
										<ShakalMascot className="preview-divider-mascot" alt="" />
									</div>
									<div className="preview-card">
										<div className="preview-label">
											<span>ПОСЛЕ</span>
											<span className="tag tag--shakal">
												{isProcessing
													? "обновляем…"
													: error
														? "ошибка"
														: "результат"}
											</span>
										</div>
										<div
											className="preview-frame preview-frame--shakal preview-frame--live"
											aria-busy={isProcessing}
										>
											{result ? (
												<>
													<img
														src={result.url}
														alt="Результат"
														className="preview-img preview-img--shakal"
													/>
													{isProcessing && (
														<div
															className="preview-live-overlay"
															aria-hidden="true"
														/>
													)}
												</>
											) : isProcessing ? (
												<div className="processing">
													<ShakalMascot className="processing-mascot" alt="" />
													<p>Шакалим…</p>
												</div>
											) : (
												<p className="preview-error">
													Не удалось получить результат
												</p>
											)}
										</div>
									</div>
								</div>
							)}
							<div className="sr-only" role="status">
								{isProcessing
									? "Обрабатываем изображение"
									: result
										? "Изображение готово к скачиванию"
										: ""}
							</div>
							<div className="controls">
								<ShakalMeter
									value={intensity}
									manual={manualSettings !== null}
									onChange={changeIntensity}
								/>
								<DegradationControls
									settings={settings}
									manual={manualSettings !== null}
									onChange={setManualSettings}
									onAutomatic={() => setManualSettings(null)}
								/>
								<EffectsPanel
									effects={effects}
									onChange={setEffects}
									pixelScale={pixelScale}
									onPixelScaleChange={setPixelScale}
									exportPng={exportPng}
									onExportPngChange={setExportPng}
								/>
								<div className="actions">
									{result && (
										<>
											<button
												type="button"
												className="btn btn--primary"
												onClick={download}
												disabled={isProcessing}
											>
												Скачать
											</button>
											<button
												type="button"
												className={`btn btn--ghost ${compareMode ? "btn--active" : ""}`}
												aria-pressed={compareMode}
												onClick={() => setCompareMode((v) => !v)}
												disabled={isProcessing}
											>
												{compareMode ? "2 окна" : "Сравнить"}
											</button>
										</>
									)}
									{error && (
										<button
											type="button"
											className="btn btn--primary"
											onClick={() => {
												setImportError(null);
												setRetry((v) => v + 1);
											}}
										>
											Попробовать снова
										</button>
									)}
									<button
										type="button"
										className="btn btn--ghost"
										onClick={reset}
									>
										Другую картинку
									</button>
								</div>
							</div>
							{result && !isProcessing && (
								<div className="stats">
									<div className="stat">
										<span className="stat-value">
											{result.stats.gridReduction}%
										</span>
										<span className="stat-label">
											уменьшение сетки
											<br />
											{result.stats.gridWidth}×{result.stats.gridHeight}
										</span>
									</div>
									<div className="stat">
										<span className="stat-value">
											{result.stats.jpegEncodes}×
										</span>
										<span className="stat-label">JPEG-кодирований</span>
									</div>
									<div className="stat">
										<span className="stat-value">
											{result.stats.jpegQuality === null
												? "—"
												: `${result.stats.jpegQuality} / 100`}
										</span>
										<span className="stat-label">JPEG-параметр</span>
									</div>
									<div className="stat">
										<span className="stat-value">
											{result.stats.effectsApplied}
										</span>
										<span className="stat-label">эффектов</span>
									</div>
									<div className="stat">
										<span className="stat-value">
											{result.stats.outputWidth}×{result.stats.outputHeight}
										</span>
										<span className="stat-label">размер изображения</span>
									</div>
									<div className="stat">
										<span className="stat-value">
											{formatBytes(result.blob.size)}
										</span>
										<span className="stat-label">размер файла</span>
									</div>
								</div>
							)}
						</div>
					)}
					{error && (
						<div className="error-message" role="alert">
							{error}
						</div>
					)}
				</section>
			</main>
			<footer className="footer">
				<ShakalMascot className="footer-mascot" alt="" />
				<p>Всё в браузере. На сервер ничего не уходит.</p>
			</footer>
		</div>
	);
}
export default App;
