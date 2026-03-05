const Medication = require("../models/Medication");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

exports.getSuggestions = async (req, res) => {
    try {
        const { summary, emrData } = req.body;

        if (!summary && !emrData) {
            return res.status(400).json({ error: "summary or emrData is required." });
        }

        // Build a rich search context from both summary and EMR symptoms
        const symptomsText = Array.isArray(emrData?.symptoms)
            ? emrData.symptoms.map((s) => s.name).filter(Boolean).join(", ")
            : "";

        const chiefComplaint = emrData?.chiefComplaint?.complaint || "";
        const searchContext = [
            summary ? `Consultation Summary: ${summary}` : "",
            symptomsText ? `Symptoms: ${symptomsText}` : "",
            chiefComplaint ? `Chief Complaint: ${chiefComplaint}` : "",
        ]
            .filter(Boolean)
            .join(". ");

        // Gemini embedding for vector search
        const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
        const embeddingResult = await embeddingModel.embedContent(searchContext);
        const queryVector = embeddingResult.embedding.values;

        // MongoDB Atlas vector search
        const retrievedDiseases = await Medication.aggregate([
            {
                $vectorSearch: {
                    index: "vector_index",
                    path: "embedding",
                    queryVector: queryVector,
                    numCandidates: 10,
                    limit: 3,
                },
            },
            {
                $project: {
                    _id: 0,
                    disease: 1,
                    icdCode: 1,
                    symptoms: 1,
                    medications: 1,
                    tests: 1,
                    score: { $meta: "vectorSearchScore" },
                },
            },
        ]);

        if (!retrievedDiseases.length) {
            return res.json([]);
        }

        // Groq LLM re-ranking + allergy check
        const allergyList =
            emrData?.allergies?.map((a) => a.allergen).filter(Boolean).join(", ") || "None";

        const prompt = `
You are a strict JSON data processor. Your ONLY output must be a valid JSON object.
Do NOT include markdown code blocks, HTML, or any conversational text.

Review the following patient context and retrieved disease matches.

Patient Context:
- Age/Gender: ${emrData?.patient?.age || "N/A"} ${emrData?.patient?.gender || "N/A"}
- Chief Complaint: ${chiefComplaint || summary || "N/A"}
- Symptoms: ${symptomsText || "N/A"}
- Conditions: ${emrData?.medicalHistory?.conditions?.map((c) => c.condition)?.join(", ") || "None"}
- Allergies: ${allergyList}

Retrieved Disease Matches:
${JSON.stringify(retrievedDiseases)}

Task:
Return a JSON object with a "suggestions" array containing the retrieved matches.
For each medication that conflicts with the patient's allergies, add "allergyWarning": true to that medication object.
Do not change any other fields.

CRITICAL JSON Rules:
1. All strings must be properly escaped
2. Arrays use [ ] brackets
3. Output nothing but the JSON object starting with { and ending with }

Expected schema:
{
  "suggestions": [
    {
      "icdCode": "string",
      "disease": "string",
      "symptoms": ["string"],
      "medications": [
        { "name": "string", "dosage": "string", "frequency": "string", "allergyWarning": false }
      ],
      "tests": ["string"],
      "score": number
    }
  ]
}`;

        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
            response_format: { type: "json_object" },
        });

        const rawOutput = chatCompletion.choices[0].message.content;
        const parsed = JSON.parse(rawOutput);

        const suggestions = Array.isArray(parsed)
            ? parsed
            : parsed.suggestions || parsed.matches || Object.values(parsed)[0] || [];

        return res.json(suggestions);
    } catch (err) {
        console.error("[Suggestion] Error:", err);
        return res.status(500).json({ error: "Failed to generate suggestions." });
    }
};
