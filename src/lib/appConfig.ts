const isTest = import.meta.env.VITE_APP_ENV === 'test';

export const APP_NAME = isTest ? 'phytoexp' : 'phyto';
