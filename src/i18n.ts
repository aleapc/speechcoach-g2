type TranslationKey =
  | 'appName'
  | 'start'
  | 'stop'
  | 'recentSessions'
  | 'noSessions'
  | 'wpm'
  | 'feedbackSlow'
  | 'feedbackOk'
  | 'feedbackFast'
  | 'feedbackPause'
  | 'summary'
  | 'duration'
  | 'avgWpm'
  | 'minWpm'
  | 'maxWpm'
  | 'variation'
  | 'backToHome'
  | 'settings'
  | 'slowThreshold'
  | 'fastThreshold'
  | 'language'
  | 'tapToStart'
  | 'tapToStop'
  | 'doubleTapBack'
  | 'swipeToggleView'
  | 'listening'
  | 'sessionComplete'
  | 'calibrating'
  | 'calibratingHint'
  | 'silenceThreshold'
  | 'wpmGraph'
  | 'timeAxis'
  | 'exportJson'
  | 'exportCsv'
  | 'exportAll'
  | 'hapticFeedback'
  | 'hapticHint';

type Translations = Record<TranslationKey, string>;

const translations: Record<string, Translations> = {
  en: {
    appName: 'SPEECH COACH',
    start: 'Start',
    stop: 'Stop',
    recentSessions: 'Recent Sessions',
    noSessions: 'No sessions yet',
    wpm: 'WPM',
    feedbackSlow: 'Speed up a bit',
    feedbackOk: 'Good pace!',
    feedbackFast: 'Slow down',
    feedbackPause: 'Take a pause',
    summary: 'Session Summary',
    duration: 'Duration',
    avgWpm: 'Avg WPM',
    minWpm: 'Min WPM',
    maxWpm: 'Max WPM',
    variation: 'Variation',
    backToHome: 'Back to Home',
    settings: 'Settings',
    slowThreshold: 'Slow below (WPM)',
    fastThreshold: 'Fast above (WPM)',
    language: 'Language',
    tapToStart: 'Tap to start',
    tapToStop: 'Tap to stop',
    doubleTapBack: 'Double-tap: back',
    swipeToggleView: 'Swipe: toggle view',
    listening: 'Listening...',
    sessionComplete: 'Session complete!',
    calibrating: 'Calibrating...',
    calibratingHint: 'Stay quiet for 3 seconds',
    silenceThreshold: 'Noise threshold (auto)',
    wpmGraph: 'WPM Timeline',
    timeAxis: 'Time (s)',
    exportJson: 'JSON',
    exportCsv: 'CSV',
    exportAll: 'Export All',
    hapticFeedback: 'Haptic (Ring)',
    hapticHint: 'Vibrate on pace change',
  },
  pt: {
    appName: 'SPEECH COACH',
    start: 'Iniciar',
    stop: 'Parar',
    recentSessions: 'Sessoes Recentes',
    noSessions: 'Nenhuma sessao',
    wpm: 'PPM',
    feedbackSlow: 'Fale mais rapido',
    feedbackOk: 'Bom ritmo!',
    feedbackFast: 'Fale mais devagar',
    feedbackPause: 'Faca uma pausa',
    summary: 'Resumo da Sessao',
    duration: 'Duracao',
    avgWpm: 'PPM Medio',
    minWpm: 'PPM Min',
    maxWpm: 'PPM Max',
    variation: 'Variacao',
    backToHome: 'Voltar ao Inicio',
    settings: 'Configuracoes',
    slowThreshold: 'Lento abaixo de (PPM)',
    fastThreshold: 'Rapido acima de (PPM)',
    language: 'Idioma',
    tapToStart: 'Toque para iniciar',
    tapToStop: 'Toque para parar',
    doubleTapBack: 'Duplo toque: voltar',
    swipeToggleView: 'Deslize: alternar vista',
    listening: 'Ouvindo...',
    sessionComplete: 'Sessao concluida!',
    calibrating: 'Calibrando...',
    calibratingHint: 'Fique em silencio por 3s',
    silenceThreshold: 'Limiar de ruido (auto)',
    wpmGraph: 'Grafico de PPM',
    timeAxis: 'Tempo (s)',
    exportJson: 'JSON',
    exportCsv: 'CSV',
    exportAll: 'Exportar Tudo',
    hapticFeedback: 'Vibrar (Anel)',
    hapticHint: 'Vibrar ao mudar ritmo',
  },
  es: {
    appName: 'SPEECH COACH',
    start: 'Iniciar',
    stop: 'Detener',
    recentSessions: 'Sesiones Recientes',
    noSessions: 'Sin sesiones',
    wpm: 'PPM',
    feedbackSlow: 'Habla mas rapido',
    feedbackOk: 'Buen ritmo!',
    feedbackFast: 'Habla mas lento',
    feedbackPause: 'Haz una pausa',
    summary: 'Resumen de Sesion',
    duration: 'Duracion',
    avgWpm: 'PPM Promedio',
    minWpm: 'PPM Min',
    maxWpm: 'PPM Max',
    variation: 'Variacion',
    backToHome: 'Volver al Inicio',
    settings: 'Configuracion',
    slowThreshold: 'Lento debajo de (PPM)',
    fastThreshold: 'Rapido encima de (PPM)',
    language: 'Idioma',
    tapToStart: 'Toca para iniciar',
    tapToStop: 'Toca para detener',
    doubleTapBack: 'Doble toque: volver',
    swipeToggleView: 'Desliza: cambiar vista',
    listening: 'Escuchando...',
    sessionComplete: 'Sesion completada!',
    calibrating: 'Calibrando...',
    calibratingHint: 'Mantente en silencio 3s',
    silenceThreshold: 'Umbral de ruido (auto)',
    wpmGraph: 'Grafico de PPM',
    timeAxis: 'Tiempo (s)',
    exportJson: 'JSON',
    exportCsv: 'CSV',
    exportAll: 'Exportar Todo',
    hapticFeedback: 'Vibracion (Anillo)',
    hapticHint: 'Vibrar al cambiar ritmo',
  },
};

import { state } from './state';

export function t(key: TranslationKey): string {
  const lang = state.language;
  return translations[lang]?.[key] ?? translations.en[key] ?? key;
}

export function getFeedbackText(zone: 'slow' | 'ok' | 'fast', wpm: number): string {
  if (wpm === 0) return t('listening');
  switch (zone) {
    case 'slow': return t('feedbackSlow');
    case 'ok': return t('feedbackOk');
    case 'fast': return t('feedbackFast');
  }
}
