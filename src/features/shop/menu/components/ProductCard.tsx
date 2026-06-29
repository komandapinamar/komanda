import Image from "next/image";
import { MenuItem } from "@/types/types";
import { useState } from "react";

export default function ProductCard({ item }: { item: MenuItem }) {
    const [active, setActive] = useState<boolean>(false);
    const TIMEOUT_MS = 200;
    const notActiveClass = `menu-page__item relative flex h-44 w-full items-stretch gap-3 overflow-hidden rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)] text-[var(--color-accent-secondary)] transition-shadow duration-${TIMEOUT_MS} hover:shadow-xl hover:[--tw-shadow-color:var(--color-accent-secondary)]`;
    const activeClass = `menu-page__item relative flex h-44 w-full items-stretch gap-3 overflow-hidden rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)] text-[var(--color-accent-secondary)] transition-shadow duration-${TIMEOUT_MS} hover:shadow-xl hover:[--tw-shadow-color:var(--color-accent-secondary)] shadow-xl [--tw-shadow-color:var(--color-accent-secondary)]`;


    function activateClass(TIMEOUT_MS: number){
        setActive(true);
        setTimeout(() => {
            setActive(false);
        }, TIMEOUT_MS);
    }
    return (
        <div className={active ? activeClass : notActiveClass} 
            onClick={()=>{activateClass(TIMEOUT_MS)}}
        >
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 p-4">
                <div className="space-y-2">
                    <h1 className="line-clamp-2 text-xl font-bold leading-tight sm:text-2xl underline-offset-4 underline">{item.name}</h1>
                    <p className="line-clamp-2 text-sm leading-5">{item.description}</p>
                </div>
                <p className="text-lg font-semibold">${item.price}</p>
            </div>

            <aside className="flex flex-none items-center p-4 pr-12">
                {/*
                {item.image ? (
                    <Image
                        className="h-28 w-28 shrink-0 rounded-sm object-cover sm:h-28 sm:w-28"
                        src={item.image}
                        alt={item.name}
                        width={128}
                        height={128}
                    />
                ) : null}
                */}
            </aside>

            <div className="absolute bottom-3 right-3">
                <button className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-accent-secondary)] text-2xl font-bold leading-none text-[var(--color-accent-primary)] shadow-md transition-transform hover:scale-105">
                    +
                </button>
            </div>
        </div>
    )
}
