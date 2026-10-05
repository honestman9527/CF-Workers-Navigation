import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function AdminErrorAlert({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{onRetry ? '加载失败' : '操作失败'}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      {onRetry ? (
        <AlertAction>
          <Button variant="outline" size="sm" disabled={retrying} onClick={onRetry}>
            重试
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}
