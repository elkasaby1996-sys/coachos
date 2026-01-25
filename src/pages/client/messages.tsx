import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";

const messages = [
  { id: 1, sender: "Coach", text: "Great job on your last session!", time: "09:14" },
  { id: 2, sender: "You", text: "Feeling strong, thank you!", time: "09:20" },
];

export function ClientMessagesPage() {
  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.sender === "You"
                    ? "ml-auto w-fit rounded-lg bg-accent/20 px-3 py-2 text-sm"
                    : "w-fit rounded-lg bg-muted px-3 py-2 text-sm"
                }
              >
                <p className="text-xs text-muted-foreground">{message.sender}</p>
                <p>{message.text}</p>
                <p className="text-[10px] text-muted-foreground">{message.time}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input placeholder="Type a message" />
            <Button>Send</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
