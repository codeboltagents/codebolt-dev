const path = require("path");

// const mammoth = require("mammoth");
const fs = require("fs/promises");

async function extractTextFromFile(filePath) {
	
	try {
		await fs.access(filePath);
	} catch (error) {
		throw new Error(`File not found: ${filePath}`);
	}
	const fileExtension = path.extname(filePath).toLowerCase();
	switch (fileExtension) {
		case ".pdf":
			return extractTextFromPDF(filePath);
		case ".docx":
			return extractTextFromDOCX(filePath);
		case ".ipynb":
			return extractTextFromIPYNB(filePath);
		default:
			return await fs.readFile(filePath, "utf8");
	}
}

async function extractTextFromPDF(filePath) {
	const { pdf } = await import("pdf-parse");

	const dataBuffer = await fs.readFile(filePath);
	const data = await pdf(dataBuffer);
	return data.text;
}

async function extractTextFromDOCX(filePath) {
	const mammoth = await import("mammoth");
	const result = await mammoth.extractRawText({ path: filePath });
	return result.value;
}

async function extractTextFromIPYNB(filePath) {
	const data = await fs.readFile(filePath, "utf8");
	const notebook = JSON.parse(data);
	let extractedText = "";

	for (const cell of notebook.cells) {
		if ((cell.cell_type === "markdown" || cell.cell_type === "code") && cell.source) {
			extractedText += cell.source.join("\n") + "\n";
		}
	}

	return extractedText;
}


module.exports={
	extractTextFromFile,
	extractTextFromIPYNB,
	extractTextFromDOCX,
	extractTextFromPDF
}