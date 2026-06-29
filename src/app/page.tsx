"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[var(--color-accent-tertiary)] text-[var(--color-accent-primary)] font-sans overflow-x-hidden flex flex-col items-center">
      
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center pt-24 pb-16 px-6 w-full max-w-6xl text-center flex-grow">
        <h1 className="text-6xl md:text-[8rem] lg:text-[10rem] font-black uppercase tracking-tighter leading-[0.85] mb-8 text-black">
          BURGERS<br />
          <span className="text-[var(--color-accent-primary)]">DE VERDAD.</span>
        </h1>
        
        <p className="text-xl md:text-3xl font-bold mb-12 max-w-4xl uppercase tracking-wide">
          Jugosas, con ingredientes frescos y el pan más suave. El auténtico sabor food truck, directo a tus manos.
        </p>

        <Link 
          href="/order" 
          className="inline-block bg-[var(--color-accent-primary)] text-[var(--color-accent-secondary)] text-3xl md:text-5xl font-black uppercase tracking-widest py-6 px-16 rounded-full hover:bg-black hover:-translate-y-2 transition-transform duration-200 border-4 border-black shadow-[0_12px_0_0_black] hover:shadow-[0_18px_0_0_black] active:shadow-none active:translate-y-[12px]"
        >
          PEDÍ AHORA
        </Link>
      </section>

      {/* Event Section */}
      <section className="w-full bg-[var(--color-accent-secondary)] border-y-8 border-black py-16 px-6 flex flex-col items-center text-center mt-8">
        <div className="max-w-4xl flex flex-col items-center">
          <h2 className="text-4xl md:text-7xl font-black uppercase tracking-tighter mb-4 text-black leading-none">
            🍻 FIESTA DE LA CERVEZA 🍻
          </h2>
          <div className="bg-black text-[var(--color-accent-secondary)] px-8 py-3 transform -rotate-2 my-4 shadow-[8px_8px_0_0_white] border-4 border-white">
            <span className="text-3xl md:text-5xl font-black uppercase tracking-widest block">
              PINAMAR
            </span>
          </div>
          <p className="text-3xl md:text-5xl font-black mt-6 text-black uppercase tracking-wide border-b-8 border-black pb-2 inline-block">
            JUEVES 2 AL SÁBADO 4
          </p>
          <p className="text-xl md:text-2xl font-bold mt-8 max-w-2xl text-black">
            ¡Venite a buscar tu hamburguesa al food truck y acompañala con la mejor cerveza tirada!
          </p>
        </div>
      </section>

      {/* Footer minimal */}
      <footer className="w-full text-center py-12 text-sm md:text-base font-black text-black uppercase tracking-widest bg-white border-t-8 border-black">
        © 2026 CHIKENSTOP // FOOD TRUCK 
      </footer>
    </main>
  );
}
