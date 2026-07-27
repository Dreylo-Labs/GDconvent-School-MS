UPDATE "Exam"
SET "passingMarks" = GREATEST(1, CEIL("totalMarks" * 0.33)::INTEGER)
WHERE "passingMarks" > "totalMarks";
