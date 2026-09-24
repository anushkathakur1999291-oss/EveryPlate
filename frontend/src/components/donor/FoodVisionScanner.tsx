import React, { useState, useEffect, useRef } from 'react';
import { Camera, Upload, Sparkles, Check, AlertTriangle, RefreshCw, X, Eye, ShieldCheck, Flame, Scale, Clock } from 'lucide-react';
import { api } from '../../services/api';
import { FoodVisionResult, VisionStatus } from '../../types';

interface FoodVisionScannerProps {
  onApply: (data: {
    foodCategory: string;
    foodDescription: string;
    quantity: number;
    notes?: string;
    suggestedDeadlineHours?: number;
  }) => void;
}

export const FoodVisionScanner: React.FC<FoodVisionScannerProps> = ({ onApply }) => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>('image/jpeg');
  const [imageFileName, setImageFileName] = useState<string>('');

  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanStage, setScanStage] = useState<string>('');
  const [visionStatus, setVisionStatus] = useState<VisionStatus | null>(null);
  const [scanResult, setScanResult] = useState<FoodVisionResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [appliedSuccess, setAppliedSuccess] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check Ollama Vision Engine health on mount
  useEffect(() => {
    let mounted = true;
    api.getVisionStatus()
      .then((status) => {
        if (mounted) setVisionStatus(status);
      })
      .catch((_err) => {
        if (mounted) {
          setVisionStatus({
            available: false,
            provider: 'ollama',
            model: 'moondream:latest',
            message: 'Local vision engine not connected. Manual intake available.',
          });
        }
      });
    return () => { mounted = false; };
  }, []);

  const handleFileProcess = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setScanError('Please select a valid image file (JPEG, PNG, WEBP).');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setScanError('Image file is larger than 12MB. Please select a smaller photo.');
      return;
    }

    setScanError(null);
    setScanResult(null);
    setAppliedSuccess(false);
    setImageFileName(file.name);
    setImageMime(file.type);

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      // Extract pure base64 without data:image/...;base64,
      const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      setImageBase64(base64Data);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleSelectSample = async (samplePath: string, sampleLabel: string) => {
    try {
      setScanError(null);
      setScanResult(null);
      setAppliedSuccess(false);
      setImageFileName(sampleLabel);

      const res = await fetch(samplePath);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setImagePreview(dataUrl);
        const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        setImageBase64(base64Data);
        setImageMime('image/jpeg');
      };
      reader.readAsDataURL(blob);
    } catch (err: any) {
      setScanError(`Failed to load sample image: ${err.message}`);
    }
  };

  const handleExecuteScan = async () => {
    if (!imageBase64) return;

    try {
      setIsScanning(true);
      setScanError(null);
      setAppliedSuccess(false);
      setScanStage('Analyzing food geometry and textures with local vision model...');

      const timer = setTimeout(() => {
        setScanStage('Extracting portions, dietary signals, and shelf-life indicators...');
      }, 1200);

      const result = await api.analyzeFoodImage(imageBase64, imageMime);
      clearTimeout(timer);
      setScanResult(result);
    } catch (err: any) {
      setScanError(err.message || 'Image analysis failed. You can still fill out the form manually.');
    } finally {
      setIsScanning(false);
      setScanStage('');
    }
  };

  const handleApplyToForm = () => {
    if (!scanResult) return;

    // Calculate recommended safe hours based on food type
    let suggestedHours = 4;
    if (scanResult.foodCategory === 'COOKED_MEALS') suggestedHours = 3;
    if (scanResult.foodCategory === 'BAKERY') suggestedHours = 24;
    if (scanResult.foodCategory === 'PRODUCE') suggestedHours = 48;
    if (scanResult.foodCategory === 'DAIRY') suggestedHours = 6;

    // Construct enriched notes from vision tags
    const notesParts: string[] = [];
    if (scanResult.itemsDetected?.length) {
      notesParts.push(`Visual detection: ${scanResult.itemsDetected.join(', ')}`);
    }
    if (scanResult.vegetarian) notesParts.push('Vegetarian');
    if (scanResult.nonVegetarian) notesParts.push('Non-Vegetarian');
    if (scanResult.packaged) notesParts.push('Pre-packaged / Sealed');
    if (scanResult.visualNotes) notesParts.push(`Notes: ${scanResult.visualNotes}`);

    onApply({
      foodCategory: scanResult.foodCategory,
      foodDescription: scanResult.foodName || scanResult.itemsDetected?.join(', ') || 'Prepared Surplus Food',
      quantity: scanResult.estimatedPortions || scanResult.estimatedQuantity || 25,
      notes: notesParts.join(' • '),
      suggestedDeadlineHours: suggestedHours,
    });

    setAppliedSuccess(true);
    setTimeout(() => setAppliedSuccess(false), 4000);
  };

  const handleClear = () => {
    setImagePreview(null);
    setImageBase64(null);
    setImageFileName('');
    setScanResult(null);
    setScanError(null);
    setAppliedSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="bg-stone-50 border border-stone-200/90 rounded-xl p-4 space-y-4 interactive-card">
      {/* Header & Engine Status */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-stone-200/70">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-800 text-white rounded-lg shadow-sm">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-bold text-stone-900 tracking-tight">AI Food Vision Assistant</h2>
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-medium">Local GPU</span>
            </div>
            <p className="text-[11px] text-stone-500">Inspect surplus food photos to prefill intake details</p>
          </div>
        </div>

        {/* Engine status indicator */}
        <div className="text-[11px] flex items-center gap-1.5 font-medium">
          {visionStatus?.available ? (
            <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/70">
              <span className="w-2 h-2 rounded-full bg-emerald-500 pulse-radar" />
              <span>Ollama Ready ({visionStatus.model})</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full border border-stone-200">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Vision Standby (Manual Entry Active)</span>
            </span>
          )}
        </div>
      </div>

      {/* Upload & Drop Zone (if no image loaded) */}
      {!imagePreview && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2.5 ${
            isDragging
              ? 'border-emerald-600 bg-emerald-50/70'
              : 'border-stone-300 hover:border-emerald-600/70 hover:bg-stone-100/60 bg-white/70'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileProcess(e.target.files[0])}
          />
          <div className="p-2.5 bg-stone-100 text-stone-600 rounded-full">
            <Upload className="w-5 h-5 text-emerald-800" />
          </div>
          <div>
            <p className="text-xs font-semibold text-stone-800">
              Drag food photo here, or <span className="text-emerald-800 underline">browse</span>
            </p>
            <p className="text-[11px] text-stone-500 mt-0.5">JPEG, PNG, or WEBP up to 12MB</p>
          </div>

          {/* Quick Demo Test Samples */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <span className="text-[10px] uppercase font-bold tracking-wider text-stone-600">Quick Test:</span>
            <button
              type="button"
              onClick={() => handleSelectSample('/images/roles/donor.jpg', 'donor-catered-meals.jpg')}
              className="text-[11px] interactive-btn bg-stone-100 hover:bg-stone-200 text-stone-800 px-2 py-0.5 rounded border border-stone-300 transition"
            >
              🍗 Catered Meals
            </button>
            <button
              type="button"
              onClick={() => handleSelectSample('/images/roles/receiver.jpg', 'shelter-produce.jpg')}
              className="text-[11px] interactive-btn bg-stone-100 hover:bg-stone-200 text-stone-800 px-2 py-0.5 rounded border border-stone-300 transition"
            >
              🍎 Fresh Produce & Bread
            </button>
          </div>
        </div>
      )}

      {/* Image Preview & Scanner Controls */}
      {imagePreview && (
        <div className="space-y-3">
          <div className="relative rounded-lg overflow-hidden bg-stone-900 border border-stone-200 aspect-[16/9] max-h-48 flex items-center justify-center">
            <img
              src={imagePreview}
              alt="Donation preview"
              className="w-full h-full object-cover"
            />

            {/* Anime.js-style Scan Laser Line while scanning */}
            {isScanning && <div className="scan-laser" />}

            {/* Overlaid file name badge */}
            <div className="absolute top-2 left-2 bg-stone-900/80 backdrop-blur-sm text-stone-200 text-[10px] font-mono px-2 py-0.5 rounded flex items-center gap-1.5">
              <Eye className="w-3 h-3 text-emerald-400" />
              <span className="truncate max-w-[180px]">{imageFileName}</span>
            </div>

            {/* Clear / Reset button */}
            {!isScanning && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Remove image"
                className="absolute top-2 right-2 p-1 bg-stone-900/80 hover:bg-stone-800 text-stone-200 hover:text-white rounded-full transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Scanning radar indicator text */}
            {isScanning && (
              <div className="absolute inset-0 bg-stone-950/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-3 text-center text-white">
                <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin mb-2" />
                <span className="text-xs font-semibold tracking-wide">{scanStage}</span>
                <span className="text-[10px] text-stone-300 mt-1 font-mono">Running local vision model (moondream)</span>
              </div>
            )}
          </div>

          {/* Action trigger before or after scan */}
          {!scanResult && !isScanning && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExecuteScan}
                className="flex-1 interactive-btn flex items-center justify-center gap-1.5 bg-emerald-800 hover:bg-emerald-900 text-white font-medium text-xs py-2 rounded-lg transition shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Inspect Food with Vision Model</span>
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="interactive-btn px-3 py-2 bg-stone-200/80 hover:bg-stone-300 text-stone-700 text-xs font-medium rounded-lg transition"
              >
                Replace
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {scanError && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Notice: </span>
            <span>{scanError}</span>
            <div className="mt-1 text-[11px] text-amber-700">
              You can still type the food details directly into the form fields below.
            </div>
          </div>
        </div>
      )}

      {/* Structured Result Presentation */}
      {scanResult && (
        <div className="bg-white border border-emerald-500/30 rounded-xl p-3.5 space-y-3 shadow-sm reveal-on-scroll">
          {/* Top detected summary */}
          <div className="flex items-start justify-between gap-2 border-b border-stone-100 pb-2.5">
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-stone-900">{scanResult.foodName || 'Detected Food Item'}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md">
                  {scanResult.foodCategory.replace('_', ' ')}
                </span>
                {scanResult.fallback && (
                  <span className="text-[9px] font-mono px-1 bg-stone-100 text-stone-600 rounded">
                    Heuristic Fallback
                  </span>
                )}
              </div>
              <p className="text-[11px] text-stone-500 mt-0.5">
                {scanResult.itemsDetected?.join(' • ') || 'Surplus nutritional items'}
              </p>
            </div>

            {/* Calibrated Confidence Badge */}
            <div className="text-right shrink-0">
              <div className="flex items-center justify-end gap-1 text-[11px] font-bold text-emerald-700 font-mono">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{Math.round(scanResult.confidence * 100)}%</span>
              </div>
              <span className="text-[10px] text-stone-600">Model Confidence</span>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-stone-50 p-2 rounded-lg border border-stone-100 flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-700 shrink-0" />
              <div>
                <span className="block text-[10px] text-stone-600">Estimated Portions</span>
                <span className="font-bold text-stone-900">
                  {scanResult.estimatedPortions || scanResult.estimatedQuantity || 25} {scanResult.quantityUnit || 'meals'}
                </span>
              </div>
            </div>

            <div className="bg-stone-50 p-2 rounded-lg border border-stone-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-700 shrink-0" />
              <div>
                <span className="block text-[10px] text-stone-600">Safe Window</span>
                <span className="font-bold text-stone-900">
                  {scanResult.foodCategory === 'COOKED_MEALS' ? '3-4 Hours' :
                   scanResult.foodCategory === 'BAKERY' ? '24 Hours' :
                   scanResult.foodCategory === 'PRODUCE' ? '24-48 Hours' : '6-12 Hours'}
                </span>
              </div>
            </div>
          </div>

          {/* Dietary & Storage Badges */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {scanResult.isCooked && (
              <span className="text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded flex items-center gap-1">
                <Flame className="w-3 h-3" /> Cooked / Prepared
              </span>
            )}
            {scanResult.vegetarian && (
              <span className="text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded">
                🌱 Vegetarian
              </span>
            )}
            {scanResult.nonVegetarian && (
              <span className="text-[10px] font-medium bg-rose-50 text-rose-800 border border-rose-200 px-2 py-0.5 rounded">
                🥩 Contains Meat
              </span>
            )}
            {scanResult.packaged && (
              <span className="text-[10px] font-medium bg-sky-50 text-sky-800 border border-sky-200 px-2 py-0.5 rounded">
                📦 Packaged
              </span>
            )}
          </div>

          {/* Visual notes or uncertainty advisory */}
          {scanResult.uncertainFields?.length > 0 && (
            <div className="text-[11px] text-stone-600 bg-stone-50 p-2 rounded border border-stone-200">
              <span className="font-semibold text-stone-700">Verification note: </span>
              <span>Please review portions and ingredients before submitting. Model noted: {scanResult.uncertainFields.join(', ')}.</span>
            </div>
          )}

          {/* Primary Action Button: Apply to Donation Form */}
          <div className="pt-1 flex gap-2">
            <button
              type="button"
              onClick={handleApplyToForm}
              className={`flex-1 interactive-btn flex items-center justify-center gap-1.5 font-bold text-xs py-2.5 rounded-lg transition shadow-sm ${
                appliedSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-800 hover:bg-emerald-900 text-white'
              }`}
            >
              {appliedSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Applied to Form!</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Apply to Donation Form</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleClear}
              className="interactive-btn px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium rounded-lg border border-stone-200 transition"
            >
              Scan New
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
