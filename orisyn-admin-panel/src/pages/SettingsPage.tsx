import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Megaphone, Wrench } from "lucide-react";

export default function SettingsPage() {
  const [maintenance, setMaintenance] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const maintenanceMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.post("/settings/maintenance", { enabled }),
    onSuccess: () => toast.success("Maintenance mode updated"),
    onError: () => toast.error("Failed to update maintenance mode"),
  });

  const announcementMutation = useMutation({
    mutationFn: (message: string) =>
      api.post("/settings/announcement", { message }),
    onSuccess: () => {
      toast.success("Announcement sent");
      setAnnouncement("");
    },
    onError: () => toast.error("Failed to send announcement"),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wrench className="h-4 w-4" /> Maintenance Mode
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Switch
              checked={maintenance}
              onCheckedChange={(checked) => {
                setMaintenance(checked);
                maintenanceMutation.mutate(checked);
              }}
            />
            <Label className="text-sm text-muted-foreground">
              {maintenance ? "Maintenance mode is ON" : "Maintenance mode is OFF"}
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Megaphone className="h-4 w-4" /> Send Announcement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Type your announcement..."
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
          />
          <Button
            onClick={() => announcementMutation.mutate(announcement)}
            disabled={!announcement.trim()}
          >
            Send
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
