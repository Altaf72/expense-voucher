// Cloudinary Connection File
// This file handles all attachment uploads (receipts, documents)
// It automatically creates compressed previews for fast mobile viewing

const cloudinaryConfig = {
  cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
};

// Upload a file and return its URL + thumbnail URL
export async function uploadAttachment(file, voucherRef) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "expense_voucher"); // we'll create this next
  formData.append("folder", `vouchers/${voucherRef}`);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/auto/upload`,
    { method: "POST", body: formData }
  );

  const data = await response.json();

  return {
    originalUrl: data.secure_url,       // full size file
    thumbnailUrl: getThumbnail(data.secure_url), // small preview
    fileName: file.name,
    fileType: file.type,
    publicId: data.public_id,
  };
}

// Automatically generate a small thumbnail from any uploaded file
function getThumbnail(url) {
  // Inserts resize instructions into the Cloudinary URL
  // w_300 = 300px wide, q_60 = 60% quality (fast loading)
  return url.replace("/upload/", "/upload/w_300,q_60,f_auto/");
}

export default cloudinaryConfig;