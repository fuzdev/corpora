import type { RequestHandler } from "./$types";

const localImages = [
  { url: "/images/docs/gallery/masonry/image.jpg", width: 610, height: 768, author: "Flowbite" },
  { url: "/images/docs/gallery/masonry/image-1.jpg", width: 610, height: 500, author: "Flowbite" },
  { url: "/images/docs/gallery/masonry/image-2.jpg", width: 610, height: 566, author: "Flowbite" },
  { url: "/images/docs/gallery/masonry/image-3.jpg", width: 610, height: 598, author: "Flowbite" },
  { url: "/images/docs/gallery/masonry/image-4.jpg", width: 610, height: 854, author: "Flowbite" },
  { url: "/images/docs/gallery/masonry/image-5.jpg", width: 610, height: 382, author: "Flowbite" },
  { url: "/images/docs/gallery/masonry/image-6.jpg", width: 610, height: 850, author: "Flowbite" },
  { url: "/images/docs/gallery/masonry/image-7.jpg", width: 610, height: 464, author: "Flowbite" },
  { url: "/images/docs/gallery/masonry/image-8.jpg", width: 610, height: 520, author: "Flowbite" },
  { url: "/images/docs/gallery/masonry/image-9.jpg", width: 610, height: 422, author: "Flowbite" },
  { url: "/images/docs/gallery/masonry/image-10.jpg", width: 610, height: 1024, author: "Flowbite" },
  { url: "/images/docs/gallery/masonry/image-11.jpg", width: 610, height: 388, author: "Flowbite" }
];

export const GET: RequestHandler = async () => {
  const data = Array.from({ length: 50 }, (_, index) => {
    const image = localImages[index % localImages.length];

    return {
      id: `local-${index + 1}`,
      download_url: image.url,
      width: image.width,
      height: image.height,
      author: image.author
    };
  });

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400" // cache for 1 day
    }
  });
};
