import { useSessionLoggingStore } from "../../store/sessionLoggingStore";
import { Button } from "../ui/button";

interface Props {
  sessionId: string;
  serverId?: string;
  serverName: string;
}

export default function SessionRecordingButton({ sessionId, serverId, serverName }: Props) {
  const startRecording = useSessionLoggingStore((s) => s.startRecording);
  const stopRecording = useSessionLoggingStore((s) => s.stopRecording);
  const isRecording = useSessionLoggingStore((s) => s.isRecording);
  const recording = isRecording(sessionId);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => {
        if (recording) void stopRecording(sessionId);
        else void startRecording(sessionId, serverId, serverName);
      }}
      title={recording ? "Stop recording" : "Record session"}
      aria-label={recording ? "Stop recording session" : "Start recording session"}
      className={recording ? "text-red-400 hover:text-red-300" : "text-faint hover:text-white"}
    >
      {recording ? (
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="5" />
          <circle cx="8" cy="8" r="3" className="animate-pulse" fill="white" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="8" cy="8" r="5" />
          <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
        </svg>
      )}
    </Button>
  );
}
