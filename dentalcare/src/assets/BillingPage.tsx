// import { useEffect, useState } from "react";
// import { useNavigate, useParams } from "react-router-dom";
// import BillingForm from "../components/BillingForm";

// export default function BillingPage() {
//   const { visitId } = useParams();
//   const navigate = useNavigate();
//   const token = JSON.parse(localStorage.getItem("user")!).token;

//   const [visit, setVisit] = useState<any>(null);
//   const [caseCompleted, setCaseCompleted] = useState<string | null>(null);
//   const [closeMessage, setCloseMessage] = useState("");

//   useEffect(() => {
//     fetch(`http://localhost:4000/visits/${visitId}`, {
//       headers: { Authorization: `Bearer ${token}` }
//     })
//       .then(res => res.json())
//       .then(data => {
//         console.log("VISIT LOADED IN BILLING PAGE:", data);
//         setVisit(data);
//       });
//   }, [visitId]);

//   if (!visit) return <p>Loading...</p>;

//   return (
//     <div>
//       <h2>Billing</h2>

//       <BillingForm visit={visit} token={token} />

//       <hr />

//       <p><b>Is the case fully completed?</b></p>

//       <label>
//         <input
//           type="radio"
//           name="caseCompleted"
//           onChange={() => setCaseCompleted("yes")}
//         />
//         Yes
//       </label>

//       <label style={{ marginLeft: 10 }}>
//         <input
//           type="radio"
//           name="caseCompleted"
//           onChange={() => setCaseCompleted("no")}
//         />
//         No
//       </label>

//       {caseCompleted && (
//         <button
//           style={{ marginTop: 10 }}
//           onClick={async () => {
//             const res = await fetch(
//               `http://localhost:4000/visits/close/${visit.visitId}`,
//               {
//                 method: "POST",
//                 headers: {
//                   "Content-Type": "application/json",
//                   Authorization: `Bearer ${token}`
//                 },
//                 body: JSON.stringify({
//                   isCompleted: caseCompleted === "yes"
//                 })
//               }
//             );

//             const data = await res.json();
//             setCloseMessage(data.message);

//             setTimeout(() => {
//               navigate("/doctor");
//             }, 1500);
//           }}
//         >
//           Close Visit
//         </button>
//       )}

//       {closeMessage && <p>{closeMessage}</p>}
//     </div>
//   );
// }
