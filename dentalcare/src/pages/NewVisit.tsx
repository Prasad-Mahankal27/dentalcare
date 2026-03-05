import VisitWorkflow from "../components/VisitWorkflow";

export default function NewVisit() {
  const token = JSON.parse(localStorage.getItem("user")!).token;

  return <VisitWorkflow token={token} />;
}
