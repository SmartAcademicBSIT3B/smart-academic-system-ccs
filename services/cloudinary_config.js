require("dotenv").config();

const path = require("node:path");
const { v2: cloudinary } = require("cloudinary");

const CLOUDINARY_CLOUD_NAME = String(
  process.env.CLOUDINARY_CLOUD_NAME || "",
).trim();
const CLOUDINARY_API_KEY = String(process.env.CLOUDINARY_API_KEY || "").trim();
const CLOUDINARY_API_SECRET = String(
  process.env.CLOUDINARY_API_SECRET || "",
).trim();
const CLOUDINARY_PROFILE_FOLDER = String(
  process.env.CLOUDINARY_PROFILE_FOLDER || "CTA Files/Profiles",
).trim();
const CLOUDINARY_EXTERNAL_PARTNER_LOGO_FOLDER = String(
  process.env.CLOUDINARY_EXTERNAL_PARTNER_LOGO_FOLDER ||
    "HTA Files/External Partners Logo",
).trim();

function isCloudinaryConfigured() {
  return Boolean(
    CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET,
  );
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
  secure: true,
});

function sanitizePublicId(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildProfilePublicId(userId, fileName) {
  const normalizedUserId = sanitizePublicId(String(userId || ""));
  if (normalizedUserId) {
    return `user_${normalizedUserId}_profile`;
  }

  // Fallback for unexpected missing user IDs.
  const parsedName = path.parse(String(fileName || "profile"));
  const safeBaseName = sanitizePublicId(parsedName.name) || "profile";
  return `profile_${safeBaseName}`;
}

async function uploadProfileImageToCloudinary(
  fileBuffer,
  fileName,
  mimeType,
  userId,
) {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env.",
    );
  }

  const publicId = buildProfilePublicId(userId, fileName);

  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: CLOUDINARY_PROFILE_FOLDER,
        public_id: publicId,
        resource_type: "image",
        overwrite: true,
        invalidate: true,
        use_filename: false,
        unique_filename: false,
      },
      (error, uploaded) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(uploaded);
      },
    );

    uploadStream.end(fileBuffer);
  });

  const finalUrl =
    result && typeof result === "object"
      ? result.secure_url || result.url || ""
      : "";

  if (!finalUrl) {
    throw new Error("Cloudinary upload succeeded but no URL was returned.");
  }

  return finalUrl;
}

function buildExternalPartnerLogoPublicId(partnerId, fileName) {
  const normalizedPartnerId = sanitizePublicId(String(partnerId || ""));
  if (normalizedPartnerId) {
    return `external_partner_${normalizedPartnerId}_logo`;
  }

  const parsedName = path.parse(String(fileName || "logo"));
  const safeBaseName = sanitizePublicId(parsedName.name) || "logo";
  return `external_partner_logo_${Date.now()}_${safeBaseName}`;
}

async function uploadExternalPartnerLogoToCloudinary(
  fileBuffer,
  fileName,
  mimeType,
  partnerId,
) {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env.",
    );
  }

  const publicId = buildExternalPartnerLogoPublicId(partnerId, fileName);

  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: CLOUDINARY_EXTERNAL_PARTNER_LOGO_FOLDER,
        public_id: publicId,
        resource_type: "image",
        overwrite: true,
        invalidate: true,
        use_filename: false,
        unique_filename: false,
      },
      (error, uploaded) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(uploaded);
      },
    );

    uploadStream.end(fileBuffer);
  });

  const finalUrl =
    result && typeof result === "object"
      ? result.secure_url || result.url || ""
      : "";

  if (!finalUrl) {
    throw new Error("Cloudinary upload succeeded but no URL was returned.");
  }

  return finalUrl;
}

function extractCloudinaryPublicId(url) {
  const str = String(url || "");
  const idx = str.indexOf("/upload/");
  if (idx < 0) return null;
  let assetPath = str.slice(idx + 8);
  // strip optional version prefix like v1234567890/
  assetPath = assetPath.replace(/^v\d+\//, "");
  // strip file extension
  assetPath = assetPath.replace(/\.[^./]+$/, "");
  return assetPath || null;
}

async function deleteCloudinaryAssetByUrl(url) {
  if (!isCloudinaryConfigured()) {
    return { success: false, message: "Cloudinary not configured." };
  }
  const publicId = extractCloudinaryPublicId(url);
  if (!publicId) {
    return { success: false, message: "Could not extract public_id from URL." };
  }
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
  });
  const ok = result && result.result === "ok";
  return { success: ok, result: result?.result };
}

module.exports = {
  cloudinary,
  isCloudinaryConfigured,
  uploadProfileImageToCloudinary,
  uploadExternalPartnerLogoToCloudinary,
  deleteCloudinaryAssetByUrl,
  buildProfilePublicId,
  buildExternalPartnerLogoPublicId,
  CLOUDINARY_PROFILE_FOLDER,
  CLOUDINARY_EXTERNAL_PARTNER_LOGO_FOLDER,
};
