import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import shakalPng from "./assets/shakal.png";
import { EffectsPanel } from "./components/EffectsPanel";
import { DEFAULT_EFFECTS, type EffectOptions } from "./lib/effects";
import {
	generateMeterPreviews,
	nearestMeterPreviewIntensity,
} from "./lib/meterPreviews";
import {
	DEFAULT_INTENSITY,
	formatBytes,
	formatIntensityLabel,
	INTENSITY_MAX,
	INTENSITY_MIN,
	LEGACY_METER_STAGES,
	type ShakalStats,
	shakalify,
} from "./lib/shakalify";
import "./App.css";

const SHAKAL = shakalPng;
const LIVE_DEBOUNCE_MS = 280;

function ShakalMeter({
	value,
	onChange,
	disabled,
}: {
	value: number;
	onChange: (intensity: number) => void;
	disabled?: boolean;
}) {
	const [previews, setPreviews] = useState<Awaited<
		ReturnType<typeof generateMeterPreviews>
	> | null>(null);
	const activePreview = nearestMeterPreviewIntensity(value);
	const fill = (value / INTENSITY_MAX) * 100;

	useEffect(() => {
		let cancelled = false;
		generateMeterPreviews(SHAKAL).then((tiles) => {
			if (!cancelled) setPreviews(tiles);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<div className="meter">
			<div className="meter-header">
				<span className="meter-label">Степень шакалинга</span>
				<span className="meter-value">{formatIntensityLabel(value)}</span>
			</div>
			<input
				type="range"
				className="meter-slider posterize-slider"
				min={INTENSITY_MIN}
				max={INTENSITY_MAX}
				step={1}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				disabled={disabled}
				style={{ "--fill": `${fill}%` } as React.CSSProperties}
				aria-label="Степень шакалинга"
			/>
			<div className="meter-labels" aria-hidden="true">
				<span>0</span>
				<span>100</span>
			</div>
			<fieldset
				className="meter-grid"
				aria-label="Быстрый выбор степени шакалинга"
			>
				{previews
					? previews.map(({ intensity, stage, src }) => (
							<button
								type="button"
								key={stage}
								className={`meter-tile ${activePreview === intensity ? "meter-tile--active" : ""}`}
								onClick={() => onChange(intensity)}
								disabled={disabled}
								aria-label={
									stage === 1
										? "Оригинал"
										: `Уровень ${stage} (${Math.round(intensity)}%)`
								}
								aria-pressed={activePreview === intensity}
							>
								<img src={src} alt="" draggable={false} />
							</button>
						))
					: Array.from({ length: LEGACY_METER_STAGES }, (_, i) => i + 1).map(
							(stage) => (
								<div
									key={`meter-skeleton-${stage}`}
									className="meter-tile meter-tile--skeleton"
								/>
							),
						)}
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

function App() {
	const [file, setFile] = useState<File | null>(null);
	const [originalUrl, setOriginalUrl] = useState<string | null>(null);
	const [resultUrl, setResultUrl] = useState<string | null>(null);
	const [intensity, setIntensity] = useState(DEFAULT_INTENSITY);
	const [effects, setEffects] = useState<EffectOptions>(DEFAULT_EFFECTS);
	const [pixelScale, setPixelScale] = useState(1);
	const [exportPng, setExportPng] = useState(false);
	const [compareMode, setCompareMode] = useState(false);
	const [completedProcessKey, setCompletedProcessKey] = useState<string | null>(
		null,
	);
	const [stats, setStats] = useState<ShakalStats | null>(null);
	const [resultSize, setResultSize] = useState<number | null>(null);
	const [dragOver, setDragOver] = useState(false);
	const resultUrlRef = useRef<string | null>(null);
	const processVersionRef = useRef(0);

	const processKey = useMemo(() => {
		if (!file) return null;
		return JSON.stringify({
			name: file.name,
			size: file.size,
			lastModified: file.lastModified,
			intensity,
			effects,
			pixelScale,
			exportPng,
		});
	}, [file, intensity, effects, pixelScale, exportPng]);

	const isProcessing =
		processKey !== null && processKey !== completedProcessKey;

	const revokeResult = useCallback(() => {
		if (resultUrlRef.current) {
			URL.revokeObjectURL(resultUrlRef.current);
			resultUrlRef.current = null;
		}
	}, []);

	useEffect(() => {
		return () => {
			if (originalUrl) URL.revokeObjectURL(originalUrl);
			revokeResult();
		};
	}, [originalUrl, revokeResult]);

	useEffect(() => {
		if (!file || !processKey) return;

		const version = ++processVersionRef.current;
		const keyAtStart = processKey;

		const timer = setTimeout(async () => {
			try {
				const {
					blob,
					previewUrl,
					stats: s,
				} = await shakalify(file, intensity, {
					effects,
					pixelScale,
					exportPng,
				});
				if (version !== processVersionRef.current) return;

				revokeResult();
				resultUrlRef.current = previewUrl;
				setResultUrl(previewUrl);
				setStats(s);
				setResultSize(blob.size);
			} catch {
				if (version === processVersionRef.current) {
					revokeResult();
					setResultUrl(null);
					setStats(null);
					setResultSize(null);
				}
			} finally {
				if (version === processVersionRef.current) {
					setCompletedProcessKey(keyAtStart);
				}
			}
		}, LIVE_DEBOUNCE_MS);

		return () => clearTimeout(timer);
	}, [
		file,
		processKey,
		intensity,
		effects,
		pixelScale,
		exportPng,
		revokeResult,
	]);

	const handleFile = useCallback(
		(incoming: File) => {
			if (!incoming.type.startsWith("image/")) return;

			revokeResult();
			setResultUrl(null);
			setStats(null);
			setResultSize(null);
			setCompareMode(false);

			if (originalUrl) URL.revokeObjectURL(originalUrl);
			setFile(incoming);
			setOriginalUrl(URL.createObjectURL(incoming));
		},
		[originalUrl, revokeResult],
	);

	const onDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setDragOver(false);
			const dropped = e.dataTransfer.files[0];
			if (dropped) handleFile(dropped);
		},
		[handleFile],
	);

	const download = () => {
		if (!resultUrl || !file) return;
		const ext = exportPng ? "png" : "jpg";
		const a = document.createElement("a");
		a.href = resultUrl;
		a.download = `shakal_${file.name.replace(/\.[^.]+$/, "")}.${ext}`;
		a.click();
	};

	const reset = () => {
		processVersionRef.current++;
		revokeResult();
		if (originalUrl) URL.revokeObjectURL(originalUrl);
		setFile(null);
		setOriginalUrl(null);
		setResultUrl(null);
		setStats(null);
		setResultSize(null);
		setCompareMode(false);
		setCompletedProcessKey(null);
	};

	return (
		<div className="app">
			<header className="header">
				<div className="header-inner">
					<ShakalMascot className="header-mascot" alt="" />
					<div className="header-text">
						<h1 className="title">
							ШАКАЛИФАЙ
							<span className="title-sub">shakalify</span>
						</h1>
					</div>
				</div>
			</header>

			<main className="main">
				<section className="panel">
					{!file ? (
						<label
							className={`dropzone ${dragOver ? "dropzone--active" : ""}`}
							onDragOver={(e) => {
								e.preventDefault();
								setDragOver(true);
							}}
							onDragLeave={() => setDragOver(false)}
							onDrop={onDrop}
						>
							<ShakalMascot className="dropzone-mascot" alt="" />
							<p className="dropzone-title">Перетащи изображение сюда</p>
							<p className="dropzone-hint">JPG · PNG · GIF · WEBP</p>
							<span className="btn btn--primary">Выбрать файл</span>
							<input
								type="file"
								accept="image/*"
								hidden
								onChange={(e) => {
									const f = e.target.files?.[0];
									if (f) handleFile(f);
								}}
							/>
						</label>
					) : (
						<div className="workspace">
							{compareMode && resultUrl && originalUrl ? (
								<ComparePreview
									originalUrl={originalUrl}
									resultUrl={resultUrl}
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
												{isProcessing ? "обновляем…" : "результат"}
											</span>
										</div>
										<div className="preview-frame preview-frame--shakal preview-frame--live">
											{resultUrl ? (
												<>
													<img
														src={resultUrl}
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
											) : (
												<div className="processing">
													<ShakalMascot className="processing-mascot" alt="" />
													<p>Шакалим…</p>
												</div>
											)}
										</div>
									</div>
								</div>
							)}

							<div className="controls">
								<ShakalMeter
									value={intensity}
									onChange={setIntensity}
									disabled={isProcessing && !resultUrl}
								/>

								<EffectsPanel
									effects={effects}
									onChange={setEffects}
									pixelScale={pixelScale}
									onPixelScaleChange={setPixelScale}
									exportPng={exportPng}
									onExportPngChange={setExportPng}
									disabled={isProcessing && !resultUrl}
								/>

								<div className="actions">
									{resultUrl && (
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
												onClick={() => setCompareMode((v) => !v)}
												disabled={isProcessing}
											>
												{compareMode ? "2 окна" : "Сравнить"}
											</button>
										</>
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

							{stats && resultSize && (
								<div className="stats">
									<div className="stat">
										<span className="stat-value">{stats.pixelsMurdered}%</span>
										<span className="stat-label">потеря деталей</span>
									</div>
									<div className="stat">
										<span className="stat-value">{stats.passes}×</span>
										<span className="stat-label">проходов JPEG</span>
									</div>
									<div className="stat">
										<span className="stat-value">
											{Math.round(stats.quality * 100)}%
										</span>
										<span className="stat-label">качество</span>
									</div>
									<div className="stat">
										<span className="stat-value">{stats.effectsApplied}</span>
										<span className="stat-label">эффектов</span>
									</div>
									<div className="stat">
										<span className="stat-value">{stats.pixelScale}×</span>
										<span className="stat-label">пиксели</span>
									</div>
									<div className="stat">
										<span className="stat-value">
											{formatBytes(resultSize)}
										</span>
										<span className="stat-label">размер файла</span>
									</div>
								</div>
							)}
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
