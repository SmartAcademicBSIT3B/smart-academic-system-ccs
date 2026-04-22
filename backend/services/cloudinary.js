const { v2: cloudinary } = require("cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

function sanitizePublicId(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function uploadStream(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    stream.end(buffer);
  });
}

async function uploadProfileImage(fileBuffer, fileName, _mimeType, userId) {
  const publicId = userId
    ? `user_${sanitizePublicId(String(userId))}_profile`
    : `profile_${sanitizePublicId(String(fileName || "profile").split(".")[0])}`;

  const result = await uploadStream(fileBuffer, {
    folder: process.env.CLOUDINARY_PROFILE_FOLDER || "CTA Files/Profiles",
    public_id: publicId,
    resource_type: "image",
    overwrite: true,
    invalidate: true,
    use_filename: false,
    unique_filename: false,
  });

  const url = result?.secure_url || result?.url || "";
  if (!url)
    throw new Error("Cloudinary upload succeeded but no URL was returned.");
  return url;
}

async function uploadPartnerLogo(fileBuffer, fileName, _mimeType, partnerId) {
  const publicId = partnerId
    ? `external_partner_${sanitizePublicId(String(partnerId))}_logo`
    : `external_partner_logo_${Date.now()}_${sanitizePublicId(String(fileName || "logo").split(".")[0])}`;

  const result = await uploadStream(fileBuffer, {
    folder:
      process.env.CLOUDINARY_EXTERNAL_PARTNER_LOGO_FOLDER ||
      "HTA Files/External Partners Logo",
    public_id: publicId,
    resource_type: "image",
    overwrite: true,
    invalidate: true,
    use_filename: false,
    unique_filename: false,
  });

  const url = result?.secure_url || result?.url || "";
  if (!url)
    throw new Error("Cloudinary upload succeeded but no URL was returned.");
  return url;
}

async function deleteByUrl(assetUrl) {
  const raw = String(assetUrl || "").trim();
  if (!raw) return;

  try {
    const parsed = new URL(raw);
    const pathParts = parsed.pathname.split("/");
    const uploadIndex = pathParts.indexOf("upload");
    if (uploadIndex === -1) return;

    const afterUpload = pathParts.slice(uploadIndex + 1);
    // Skip version segment (v1234567890)
    const withoutVersion = afterUpload[0]?.match(/^v\d+$/)
      ? afterUpload.slice(1)
      : afterUpload;
    const publicIdWithExt = withoutVersion.join("/");
    const publicId = publicIdWithExt.replace(/\.[^.]+$/, "");

    if (publicId) {
      await cloudinary.uploader.destroy(publicId, { invalidate: true });
    }
  } catch (_error) {
    // Best-effort cleanup; don't throw.
  }
}

module.exports = { uploadProfileImage, uploadPartnerLogo, deleteByUrl };
