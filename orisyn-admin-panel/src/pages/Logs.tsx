import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface LogEntry {
  id: string;
  user: string;
  action: string;
  timestamp: string;
}

const PAGE_SIZE = 15;

export default function Logs() {
  const [page, setPage] = useState(1);

  const { data: logs, isLoading } = useQuery<LogEntry[]>({
    queryKey: ["logs", page],
    queryFn: () =>
      api.get(`/logs?page=${page}&limit=${PAGE_SIZE}`).then((r) => r.data),
    retry: false,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Activity Logs</h1>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !logs || logs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No logs found</div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">{log.user}</TableCell>
                  <TableCell>{log.action}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(log.timestamp).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-center gap-4">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        <span className="text-sm text-muted-foreground">Page {page}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={!logs || logs.length < PAGE_SIZE}
          onClick={() => setPage((p) => p + 1)}
        >
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
