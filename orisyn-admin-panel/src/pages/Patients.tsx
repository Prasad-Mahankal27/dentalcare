import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useState } from "react";

interface Patient {
  id: string;
  name: string;
  phone: string;
  last_visit: string;
  visit_count: number;
  email?: string;
  address?: string;
}

export default function Patients() {
  const [selected, setSelected] = useState<Patient | null>(null);

  const { data: patients, isLoading } = useQuery<Patient[]>({
    queryKey: ["patients"],
    queryFn: () => api.get("/patients").then((r) => r.data),
    retry: false,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Patients</h1>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !patients || patients.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No patients found
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Last Visit</TableHead>
                <TableHead>Visit Count</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(p)}
                >
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.phone}</TableCell>
                  <TableCell>{new Date(p.last_visit).toLocaleDateString()}</TableCell>
                  <TableCell>{p.visit_count}</TableCell>
                  <TableCell>
                    <Badge variant={p.visit_count === 1 ? "default" : "secondary"}>
                      {p.visit_count === 1 ? "New" : "Recurring"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>Patient details</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Phone:</span> {selected.phone}</p>
              <p><span className="font-medium">Email:</span> {selected.email || "N/A"}</p>
              <p><span className="font-medium">Address:</span> {selected.address || "N/A"}</p>
              <p><span className="font-medium">Last Visit:</span> {new Date(selected.last_visit).toLocaleDateString()}</p>
              <p><span className="font-medium">Visit Count:</span> {selected.visit_count}</p>
              <p>
                <span className="font-medium">Type:</span>{" "}
                {selected.visit_count === 1 ? "New" : "Recurring"}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
