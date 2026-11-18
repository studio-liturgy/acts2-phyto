/**
 * A legal-page section number that differs inside the phyto app, where the
 * giving sections are hidden (`data-giving`). The page text keeps the web
 * number; styles.css swaps in `app` when <html data-native-app> is set.
 */
export function LegalNum({ web, app }: { web: number; app: number }) {
  return (
    <span className="legal-num" data-app-num={app}>
      <span>{web}</span>
    </span>
  );
}
