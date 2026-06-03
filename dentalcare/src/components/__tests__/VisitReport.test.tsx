import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import VisitReport from "../VisitReport";

describe("VisitReport Component", () => {
  const mockPatient = {
    name: "John Doe",
    patientId: "PAT123",
    phone: "1234567890",
    gender: "Male"
  };

  const mockVisit = {
    visitId: "VIS123",
    createdAt: "2026-03-05T10:00:00Z",
    symptoms: "Toothache, Sensitivity",
    diagnosis: "Dental Caries",
    observations: "Deep cavity in lower left molar",
    treatmentPlan: "Root Canal recommended",
    medicines: JSON.stringify([
      { name: "Amoxicillin", dosage: "500mg", frequency: "3x daily", duration: "5 days" },
      { name: "Ibuprofen", dosage: "400mg", frequency: "2x daily", duration: "3 days" }
    ]),
    bill: {
      currentCharges: 2500,
      discount: 500,
      paidAmount: 2000,
      pendingAmount: 0
    },
    followUpAdvice: "Come back after 5 days"
  };

  it("renders patient information correctly", () => {
    render(<VisitReport visit={mockVisit} patient={mockPatient} />);
    
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("PAT123")).toBeInTheDocument();
  });

  it("renders clinical assessment correctly", () => {
    render(<VisitReport visit={mockVisit} patient={mockPatient} />);
    
    expect(screen.getByText("Toothache")).toBeInTheDocument();
    expect(screen.getByText("Sensitivity")).toBeInTheDocument();
    expect(screen.getByText("Dental Caries")).toBeInTheDocument();
    expect(screen.getByText("Deep cavity in lower left molar")).toBeInTheDocument();
  });

  it("parses and renders JSON medicines correctly", () => {
    render(<VisitReport visit={mockVisit} patient={mockPatient} />);
    
    // Check if the prescription table renders the parsed medicines
    expect(screen.getByText("Amoxicillin")).toBeInTheDocument();
    expect(screen.getByText("500mg")).toBeInTheDocument();
    expect(screen.getByText("Ibuprofen")).toBeInTheDocument();
  });

  it("handles missing medicines gracefully", () => {
    const visitNoMeds = { ...mockVisit, medicines: null };
    render(<VisitReport visit={visitNoMeds} patient={mockPatient} />);
    
    // Prescription section shouldn't throw error. 
    // It's technically valid to not show the section heading if there are no meds.
    expect(screen.queryByText("Amoxicillin")).not.toBeInTheDocument();
  });

  it("renders billing math correctly", () => {
    render(<VisitReport visit={mockVisit} patient={mockPatient} />);
    
    // Total payable is charges (2500) - discount (500) = 2000
    // It will find two ₹2000s (paidAmount and total payable)
    const elements = screen.getAllByText("₹2000");
    expect(elements.length).toBeGreaterThanOrEqual(1);
    
    expect(screen.getByText("- ₹500")).toBeInTheDocument();
    expect(screen.getByText("₹2500")).toBeInTheDocument();
  });
});
